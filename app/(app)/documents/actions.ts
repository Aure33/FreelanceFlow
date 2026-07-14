"use server";

// Server actions de l'éditeur de document (issue #8) — devis & factures.
//
// SÉCURITÉ (non négociable) : Prisma CONTOURNE la RLS Postgres. CHAQUE requête
// filtre explicitement par utilisateur (where: { userId }), après requireUserId().
// Un document appartient à un projet, lui-même rattaché à l'utilisateur : on
// VÉRIFIE l'appartenance du projectId AVANT toute écriture — on n'écrit jamais
// sur le projet d'autrui. Entrées validées avec zod. Aucun détail technique
// n'est renvoyé au client (messages FR neutres).
//
// ARGENT : totaux recalculés côté serveur (jamais confiance à l'entrée) via les
// fonctions PURES de lib/invoicing — mêmes calculs que l'aperçu live, en
// CENTIMES ENTIERS. La franchise en base force la TVA à 0 sur chaque ligne.
//
// NUMÉROTATION : attribuée uniquement à l'ÉMISSION (pas au brouillon), dans une
// transaction, en s'appuyant sur l'unicité (user_id, number). Les collisions
// concurrentes (P2002) déclenchent un nouvel essai avec le numéro suivant.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import {
  computeTotals,
  computeDueDate,
  lineHtCents,
  legalMentions,
  nextNumber,
  documentPrefix,
  ALLOWED_TVA_RATES,
  type DocType,
  type PaymentTerm,
  type TvaRegime,
} from "@/lib/invoicing";

// --- Types exposés à l'UI ----------------------------------------------------

// Option du sélecteur de projet : chaque projet porte son client (nom + SIRET),
// nécessaire à l'aperçu (bloc « Facturé à »).
export type ProjectPickerOption = {
  id: string;
  name: string;
  clientName: string;
  clientSiret: string | null;
};

// Ligne saisie dans l'éditeur (valeurs brutes du formulaire : zod coerce).
export type DocumentLineInput = {
  label: string;
  quantity: number | string;
  unitPriceCents: number | string;
  tvaRate: number | string;
};

// Entrée commune brouillon / émission.
export type DocumentInput = {
  id?: string;
  type: DocType;
  projectId: string;
  object?: string;
  issuedAt?: string | Date;
  paymentTerms?: PaymentTerm;
  lines: DocumentLineInput[];
};

// Résultats des actions d'écriture.
export type SaveDraftResult = { id: string } | { error: string };
export type EmitResult = { id: string; number: string } | { error: string };

// Statut EFFECTIF exposé à l'UI. « en_retard » est DÉRIVÉ (jamais stocké) :
// une facture « envoye », non payée, dont l'échéance est passée. Les autres
// valeurs sont celles de la base.
export type DocumentStatus =
  | "brouillon"
  | "envoye"
  | "accepte"
  | "refuse"
  | "paye"
  | "en_retard";

// Ligne de la liste Devis / Factures (cf. maquettes Factures.html / Devis.html :
// Pièce, Client, Objet, Émise le/Envoyé, Échéance/Validité, Statut, Montant TTC).
export type DocumentListItem = {
  id: string;
  number: string | null; // null tant que le document est en brouillon
  clientName: string;
  object: string | null;
  status: DocumentStatus; // effectif (en_retard dérivé)
  issuedAt: Date | null;
  dueAt: Date | null;
  totalTtcCents: number;
};

// Bandeau de synthèse des factures (montants en CENTIMES entiers).
export type InvoiceSummary = {
  paidCents: number; // encaissé : Σ factures payées
  pendingCents: number; // en attente : Σ envoyées non échues
  overdueCents: number; // en retard : Σ échues non payées
};

// Bandeau de synthèse des devis (pipeline).
export type QuoteSummary = {
  pendingCents: number; // en attente de réponse : Σ devis envoyés
  acceptedCents: number; // acceptés : Σ devis acceptés
  acceptanceRate: number; // taux d'acceptation : acceptés / (acceptés + refusés), en %
};

// Ligne détaillée pour la vue Document (une ligne du tableau A4).
export type DocumentLineView = {
  id: string;
  label: string;
  quantity: number; // Decimal -> number (2 décimales max)
  unitPriceCents: number;
  tvaRate: number; // Decimal -> number
  htCents: number; // Total HT de la ligne (recalculé, pur)
};

// Vue complète d'un document (entête émetteur/client, lignes, totaux, mentions).
export type DocumentView = {
  id: string;
  type: DocType;
  number: string | null;
  status: DocumentStatus; // effectif
  object: string | null;
  tvaRegime: TvaRegime;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  // Émetteur = profil de l'utilisateur (bloc en-tête du document).
  emitter: {
    name: string | null;
    address: string | null;
    siret: string | null;
    iban: string | null;
    bic: string | null;
  };
  // Client = client du projet rattaché (bloc « Facturé à » / « Adressé à »).
  client: {
    name: string;
    address: string | null;
    siret: string | null;
  };
  project: { id: string; name: string };
  lines: DocumentLineView[];
  totalHtCents: number;
  totalTvaCents: number;
  totalTtcCents: number;
  legalMentions: string[]; // mentions légales déduites (type + régime)
  // Traçabilité conversion (#61) : devis d'origine (sur une facture convertie)
  // et facture issue de ce devis (sur un devis converti).
  sourceQuote: { id: string; number: string | null } | null;
  convertedInvoice: {
    id: string;
    number: string | null;
    isDraft: boolean;
  } | null;
};

// Résultat d'une transition de statut (le succès revalide et ne renvoie rien).
export type UpdateStatusResult = { ok: true } | { error: string };

// Statut effectif : la SEULE dérivation « en retard » (jamais mutée en base).
// Une facture envoyée, non payée, dont l'échéance est dépassée => en_retard.
function effectiveStatus(
  row: {
    type: string;
    status: string;
    dueAt: Date | null;
    paidAt: Date | null;
  },
  now: Date,
): DocumentStatus {
  if (
    row.type === "facture" &&
    row.status === "envoye" &&
    row.paidAt === null &&
    row.dueAt !== null &&
    row.dueAt.getTime() < now.getTime()
  ) {
    return "en_retard";
  }
  return row.status as DocumentStatus;
}

// --- Validation --------------------------------------------------------------

const lineSchema = z.object({
  label: z.string().trim().min(1, "La désignation d'une ligne est requise."),
  quantity: z.coerce
    .number()
    .positive("La quantité doit être strictement positive."),
  unitPriceCents: z.coerce
    .number()
    .int("Le prix unitaire doit être en centimes entiers.")
    .min(0, "Le prix unitaire ne peut pas être négatif."),
  tvaRate: z.coerce
    .number()
    .refine(
      (v) => (ALLOWED_TVA_RATES as readonly number[]).includes(v),
      "Taux de TVA non autorisé.",
    ),
});

const objectSchema = z
  .string()
  .trim()
  .max(200, "L'objet est trop long.")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const baseSchema = z.object({
  id: z.string().uuid("Document invalide.").optional(),
  type: z.enum(["devis", "facture"], { error: "Type de document invalide." }),
  projectId: z.string().uuid("Projet invalide."),
  object: objectSchema,
  issuedAt: z.coerce.date().optional(),
  paymentTerms: z
    .enum(["reception", "net30", "net45em", "net60"])
    .default("net30"),
  lines: z.array(lineSchema),
});

// Émettre exige au moins une ligne (un document vide n'a pas de sens légal).
const emitSchema = baseSchema.extend({
  lines: z
    .array(lineSchema)
    .min(1, "Ajoutez au moins une ligne pour émettre le document."),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Formulaire invalide.";
}

// Sécurise le régime lu en base vers l'union typée (défaut : reel).
function normalizeRegime(value: string | null | undefined): TvaRegime {
  return value === "franchise" || value === "normal" ? value : "reel";
}

// En franchise, la TVA est TOUJOURS 0 (art. 293 B) : le serveur l'impose,
// quel que soit le taux transmis par le formulaire.
function normalizedLines(
  lines: z.infer<typeof lineSchema>[],
  regime: TvaRegime,
) {
  return lines.map((l, i) => ({
    label: l.label,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    tvaRate: regime === "franchise" ? 0 : l.tvaRate,
    position: i,
  }));
}

// --- Lecture -----------------------------------------------------------------

// Projets de l'utilisateur pour le sélecteur de l'éditeur (avec leur client).
export async function listProjectsForPicker(): Promise<ProjectPickerOption[]> {
  const userId = await requireUserId();

  const rows = await prisma.project.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      client: { select: { name: true, siret: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
    clientSiret: p.client.siret ?? null,
  }));
}

// Liste des documents d'un type (devis | facture) pour l'utilisateur courant.
// SÉCURITÉ : where: { userId, type }. ÉCO : select explicite (jamais l'objet
// entier), tri en base. Le nom du client vient de project -> client.
// Le statut « en_retard » est DÉRIVÉ à la lecture (jamais stocké).
export async function listDocuments(
  type: DocType,
): Promise<DocumentListItem[]> {
  const userId = await requireUserId();

  const rows = await prisma.document.findMany({
    where: { userId, type },
    select: {
      id: true,
      number: true,
      object: true,
      type: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      totalTtcCents: true,
      project: { select: { client: { select: { name: true } } } },
    },
    orderBy: [
      { issuedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  const now = new Date();
  return rows.map((d) => ({
    id: d.id,
    number: d.number,
    clientName: d.project.client.name,
    object: d.object,
    status: effectiveStatus(d, now),
    issuedAt: d.issuedAt,
    dueAt: d.dueAt,
    totalTtcCents: d.totalTtcCents,
  }));
}

// Bandeau de synthèse des factures. Agrégations CÔTÉ BASE (_sum), pas en JS :
//  - encaissé   : Σ TTC des factures « paye » ;
//  - en attente : Σ TTC des factures « envoye » non échues (échéance à venir) ;
//  - en retard  : Σ TTC des factures « envoye » échues et non payées.
// Ces trois ensembles sont disjoints (paye vs envoye, échu vs non échu).
export async function listInvoiceSummary(): Promise<InvoiceSummary> {
  const userId = await requireUserId();
  const now = new Date();

  const [paid, pending, overdue] = await Promise.all([
    prisma.document.aggregate({
      where: { userId, type: "facture", status: "paye" },
      _sum: { totalTtcCents: true },
    }),
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        // non échue : pas d'échéance, ou échéance dans le futur.
        OR: [{ dueAt: null }, { dueAt: { gte: now } }],
      },
      _sum: { totalTtcCents: true },
    }),
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        dueAt: { lt: now },
      },
      _sum: { totalTtcCents: true },
    }),
  ]);

  return {
    paidCents: paid._sum.totalTtcCents ?? 0,
    pendingCents: pending._sum.totalTtcCents ?? 0,
    overdueCents: overdue._sum.totalTtcCents ?? 0,
  };
}

// Bandeau de synthèse des devis (pipeline). Agrégations côté base.
// Taux d'acceptation = acceptés / (acceptés + refusés), en % arrondi ; 0 si
// aucun devis tranché (évite une division par zéro).
export async function listQuoteSummary(): Promise<QuoteSummary> {
  const userId = await requireUserId();

  const [pending, accepted, acceptedCount, refusedCount] = await Promise.all([
    prisma.document.aggregate({
      where: { userId, type: "devis", status: "envoye" },
      _sum: { totalTtcCents: true },
    }),
    prisma.document.aggregate({
      where: { userId, type: "devis", status: "accepte" },
      _sum: { totalTtcCents: true },
    }),
    prisma.document.count({
      where: { userId, type: "devis", status: "accepte" },
    }),
    prisma.document.count({
      where: { userId, type: "devis", status: "refuse" },
    }),
  ]);

  const decided = acceptedCount + refusedCount;
  const acceptanceRate =
    decided === 0 ? 0 : Math.round((acceptedCount / decided) * 100);

  return {
    pendingCents: pending._sum.totalTtcCents ?? 0,
    acceptedCents: accepted._sum.totalTtcCents ?? 0,
    acceptanceRate,
  };
}

// Vue complète d'un document. findFirst + filtre userId : un id d'un autre
// utilisateur (ou un non-UUID) renvoie null — isolation garantie côté app.
// Émetteur = profil users ; client = project -> client. Lignes triées par
// position. Le régime figé à l'émission (tvaRegime) fait foi pour les mentions ;
// pour un brouillon (non figé) on retombe sur le régime courant du profil.
export async function getDocument(id: string): Promise<DocumentView | null> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) return null;

  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: {
      id: true,
      type: true,
      number: true,
      status: true,
      object: true,
      tvaRegime: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      totalHtCents: true,
      totalTvaCents: true,
      totalTtcCents: true,
      user: {
        select: {
          name: true,
          address: true,
          siret: true,
          iban: true,
          bic: true,
          tvaRegime: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { name: true, address: true, siret: true } },
        },
      },
      lines: {
        select: {
          id: true,
          label: true,
          quantity: true,
          unitPriceCents: true,
          tvaRate: true,
        },
        orderBy: { position: "asc" },
      },
      // Traçabilité conversion (#61). Relations internes à la ligne (déjà
      // filtrée userId) : un devis ne peut référencer que des documents du
      // même utilisateur (convertQuoteToInvoice l'impose à l'écriture).
      sourceQuote: { select: { id: true, number: true } },
      convertedInvoice: {
        select: { id: true, number: true, status: true },
      },
    },
  });

  if (!doc) return null;

  const type = doc.type as DocType;
  const regime = normalizeRegime(doc.tvaRegime ?? doc.user.tvaRegime);
  const now = new Date();

  const lines: DocumentLineView[] = doc.lines.map((l) => {
    const quantity = Number(l.quantity);
    const tvaRate = Number(l.tvaRate);
    return {
      id: l.id,
      label: l.label,
      quantity,
      unitPriceCents: l.unitPriceCents,
      tvaRate,
      htCents: lineHtCents(quantity, l.unitPriceCents),
    };
  });

  const converted = doc.convertedInvoice;

  return {
    id: doc.id,
    type,
    number: doc.number,
    status: effectiveStatus(doc, now),
    object: doc.object,
    tvaRegime: regime,
    issuedAt: doc.issuedAt,
    dueAt: doc.dueAt,
    paidAt: doc.paidAt,
    emitter: {
      name: doc.user.name,
      address: doc.user.address,
      siret: doc.user.siret,
      iban: doc.user.iban,
      bic: doc.user.bic,
    },
    client: {
      name: doc.project.client.name,
      address: doc.project.client.address,
      siret: doc.project.client.siret,
    },
    project: { id: doc.project.id, name: doc.project.name },
    lines,
    totalHtCents: doc.totalHtCents,
    totalTvaCents: doc.totalTvaCents,
    totalTtcCents: doc.totalTtcCents,
    legalMentions: legalMentions({ type, regime }),
    sourceQuote: doc.sourceQuote
      ? { id: doc.sourceQuote.id, number: doc.sourceQuote.number }
      : null,
    convertedInvoice: converted
      ? {
          id: converted.id,
          number: converted.number,
          isDraft: converted.status === "brouillon",
        }
      : null,
  };
}

// --- Écriture : brouillon ----------------------------------------------------

// Crée ou met à jour un document en statut « brouillon », SANS numéro.
// Recalcule et stocke les totaux. Vérifie l'appartenance du projet. Un document
// déjà émis n'est plus modifiable ici.
export async function saveDraft(input: DocumentInput): Promise<SaveDraftResult> {
  const userId = await requireUserId();

  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, type, projectId, object, issuedAt, lines } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return { error: "Projet introuvable." };

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { tvaRegime: true },
  });
  const regime = normalizeRegime(me?.tvaRegime);
  const lns = normalizedLines(lines, regime);
  const totals = computeTotals(lns);
  const issued = issuedAt ?? new Date();

  try {
    if (id) {
      const existing = await prisma.document.findFirst({
        where: { id, userId },
        select: { status: true },
      });
      if (!existing) return { error: "Document introuvable." };
      if (existing.status !== "brouillon") {
        return {
          error: "Ce document a déjà été émis et ne peut plus être modifié.",
        };
      }

      await prisma.$transaction([
        prisma.documentLine.deleteMany({ where: { documentId: id, userId } }),
        prisma.document.update({
          where: { id },
          data: {
            type,
            projectId,
            object: object ?? null,
            issuedAt: issued,
            totalHtCents: totals.totalHtCents,
            totalTvaCents: totals.totalTvaCents,
            totalTtcCents: totals.totalTtcCents,
            lines: {
              create: lns.map((l) => ({
                userId,
                label: l.label,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                tvaRate: l.tvaRate,
                position: l.position,
              })),
            },
          },
        }),
      ]);

      revalidatePath("/factures");
      revalidatePath("/devis");
      return { id };
    }

    const created = await prisma.document.create({
      data: {
        userId,
        projectId,
        type,
        status: "brouillon",
        object: object ?? null,
        issuedAt: issued,
        totalHtCents: totals.totalHtCents,
        totalTvaCents: totals.totalTvaCents,
        totalTtcCents: totals.totalTtcCents,
        lines: {
          create: lns.map((l) => ({
            userId,
            label: l.label,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            tvaRate: l.tvaRate,
            position: l.position,
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath("/factures");
    revalidatePath("/devis");
    return { id: created.id };
  } catch {
    return {
      error: "Impossible d'enregistrer le brouillon. Réessayez dans un instant.",
    };
  }
}

// --- Écriture : émission -----------------------------------------------------

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

// Émet un document : attribue le prochain numéro (transaction + unicité base),
// pose issuedAt/dueAt, copie le régime TVA du profil, passe le statut à
// « envoye ». Recalcule les totaux. Gère les collisions de numéro par nouvel
// essai. À utiliser une fois le paywall vérifié en amont (issue #10).
export async function emitDocument(input: DocumentInput): Promise<EmitResult> {
  const userId = await requireUserId();

  const parsed = emitSchema.safeParse(input);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, type, projectId, object, issuedAt, paymentTerms, lines } =
    parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return { error: "Projet introuvable." };

  // Paywall (#10) : le forfait Gratuit autorise 5 documents ÉMIS par mois
  // calendaire (devis + factures confondus). Le compteur s'appuie sur
  // `emittedAt`, un horodatage SERVEUR posé uniquement ici (jamais sur
  // `issuedAt`, éditable par l'utilisateur — contournable en antidatant).
  // Vérifié AVANT toute écriture : aucun numéro n'est consommé si le quota
  // est atteint.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { planType: true, tvaRegime: true },
  });
  if (me?.planType !== "premium") {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const emittedThisMonth = await prisma.document.count({
      where: {
        userId,
        emittedAt: { gte: monthStart, lt: monthEnd },
      },
    });
    if (emittedThisMonth >= 5) {
      return {
        error:
          "Vous avez atteint la limite de 5 documents pour ce mois-ci sur le forfait Gratuit.",
      };
    }
  }

  // Un document déjà émis ne se ré-émet pas (numéro figé).
  if (id) {
    const existing = await prisma.document.findFirst({
      where: { id, userId },
      select: { status: true },
    });
    if (!existing) return { error: "Document introuvable." };
    if (existing.status !== "brouillon") {
      return { error: "Ce document a déjà été émis." };
    }
  }

  const regime = normalizeRegime(me?.tvaRegime);
  const lns = normalizedLines(lines, regime);
  const totals = computeTotals(lns);
  const issued = issuedAt ?? new Date();
  const emitted = new Date(); // horodatage SERVEUR de l'émission — jamais rejoué
  const dueAt = computeDueDate(issued, paymentTerms);
  const year = issued.getUTCFullYear();
  const prefix = documentPrefix(type);

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await prisma.document.findMany({
      where: { userId, type, number: { startsWith: `${prefix}-${year}-` } },
      select: { number: true },
    });
    const number = nextNumber(
      type,
      year,
      existing.map((d) => d.number),
    );

    try {
      let resultId = id ?? "";
      await prisma.$transaction(async (tx) => {
        if (id) {
          await tx.documentLine.deleteMany({
            where: { documentId: id, userId },
          });
          await tx.document.update({
            where: { id },
            data: {
              type,
              projectId,
              object: object ?? null,
              number,
              status: "envoye",
              tvaRegime: regime,
              totalHtCents: totals.totalHtCents,
              totalTvaCents: totals.totalTvaCents,
              totalTtcCents: totals.totalTtcCents,
              issuedAt: issued,
              emittedAt: emitted,
              dueAt,
              lines: {
                create: lns.map((l) => ({
                  userId,
                  label: l.label,
                  quantity: l.quantity,
                  unitPriceCents: l.unitPriceCents,
                  tvaRate: l.tvaRate,
                  position: l.position,
                })),
              },
            },
          });
        } else {
          const created = await tx.document.create({
            data: {
              userId,
              projectId,
              type,
              number,
              status: "envoye",
              object: object ?? null,
              tvaRegime: regime,
              totalHtCents: totals.totalHtCents,
              totalTvaCents: totals.totalTvaCents,
              totalTtcCents: totals.totalTtcCents,
              issuedAt: issued,
              emittedAt: emitted,
              dueAt,
              lines: {
                create: lns.map((l) => ({
                  userId,
                  label: l.label,
                  quantity: l.quantity,
                  unitPriceCents: l.unitPriceCents,
                  tvaRate: l.tvaRate,
                  position: l.position,
                })),
              },
            },
            select: { id: true },
          });
          resultId = created.id;
        }
      });

      revalidatePath("/factures");
      revalidatePath("/devis");
      return { id: resultId, number };
    } catch (e) {
      // Collision de numéro (course entre deux émissions) : on recalcule.
      if (isUniqueViolation(e)) continue;
      return {
        error: "Impossible d'émettre le document. Réessayez dans un instant.",
      };
    }
  }

  return {
    error:
      "Impossible d'attribuer un numéro pour le moment. Réessayez dans un instant.",
  };
}

// --- Écriture : transition de statut ----------------------------------------

// Statuts cibles autorisés PAR TYPE (le formulaire ne décide de rien) :
//  - facture : « paye » (Marquer payé) ou « envoye » (relance / dé-marquage) ;
//  - devis   : « accepte », « refuse » ou « envoye ».
const invoiceStatusSchema = z.enum(["paye", "envoye"]);
const quoteStatusSchema = z.enum(["accepte", "refuse", "envoye"]);

// Fait avancer le statut d'un document. Vérifie l'appartenance (where: { id,
// userId }), valide la transition selon le TYPE (zod), pose/retire paidAt.
// Ne crée jamais de faux statut « en_retard » (dérivé, jamais écrit). Revalide
// les listes /factures et /devis.
export async function updateDocumentStatus(
  id: string,
  status: string,
): Promise<UpdateStatusResult> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Document introuvable." };
  }

  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: { type: true, status: true },
  });
  if (!doc) return { error: "Document introuvable." };

  // Un brouillon n'a pas encore été émis : il n'a pas de statut à faire avancer.
  if (doc.status === "brouillon") {
    return { error: "Ce document est encore en brouillon." };
  }

  const parsed =
    doc.type === "facture"
      ? invoiceStatusSchema.safeParse(status)
      : quoteStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { error: "Transition de statut invalide." };
  }
  const target = parsed.data;

  try {
    await prisma.document.update({
      where: { id },
      data: {
        status: target,
        // paidAt n'a de sens que pour une facture payée ; sinon on le retire.
        paidAt: target === "paye" ? new Date() : null,
      },
    });
  } catch {
    return {
      error: "Impossible de mettre à jour le statut. Réessayez dans un instant.",
    };
  }

  revalidatePath("/factures");
  revalidatePath("/devis");
  return { ok: true };
}

// --- Conversion devis → facture (issue #61) -----------------------------------

export type ConvertQuoteResult = { id: string } | { error: string };

// Convertit un devis ACCEPTÉ en BROUILLON de facture : reprend projet, objet et
// lignes (libellés, quantités, PU, taux TVA — copie exacte en centimes) + pose
// la traçabilité `sourceQuoteId`. AUCUN numéro n'est attribué ici et le quota
// freemium n'est pas consommé : les deux restent du ressort d'emitDocument(),
// appelé depuis l'éditeur où le brouillon s'ouvre pour relecture.
// Un devis ne se convertit qu'UNE fois (le même travail ne se facture pas deux
// fois par ce raccourci — dupliquer un document reste possible plus tard, #66).
export async function convertQuoteToInvoice(
  id: string,
): Promise<ConvertQuoteResult> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Devis introuvable." };
  }

  // Appartenance + type vérifiés en une requête (même réponse qu'un id
  // inexistant si le devis est à autrui — aucune fuite d'existence).
  const quote = await prisma.document.findFirst({
    where: { id, userId, type: "devis" },
    select: {
      id: true,
      status: true,
      projectId: true,
      object: true,
      totalHtCents: true,
      totalTvaCents: true,
      totalTtcCents: true,
      lines: {
        select: {
          label: true,
          quantity: true,
          unitPriceCents: true,
          tvaRate: true,
          position: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!quote) return { error: "Devis introuvable." };

  if (quote.status !== "accepte") {
    return { error: "Seul un devis accepté peut être converti en facture." };
  }

  const existing = await prisma.document.findFirst({
    where: { sourceQuoteId: quote.id, userId },
    select: { number: true },
  });
  if (existing) {
    return {
      error: existing.number
        ? `Ce devis a déjà été converti (facture ${existing.number}).`
        : "Ce devis a déjà été converti — un brouillon de facture existe.",
    };
  }

  let created;
  try {
    created = await prisma.document.create({
      data: {
        userId,
        projectId: quote.projectId,
        type: "facture",
        status: "brouillon",
        object: quote.object,
        issuedAt: new Date(),
        // Totaux copiés du devis (calculés à partir des MÊMES lignes) ; ils
        // seront de toute façon recalculés côté serveur à l'émission.
        totalHtCents: quote.totalHtCents,
        totalTvaCents: quote.totalTvaCents,
        totalTtcCents: quote.totalTtcCents,
        sourceQuoteId: quote.id,
        lines: {
          create: quote.lines.map((l) => ({
            userId,
            label: l.label,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            tvaRate: l.tvaRate,
            position: l.position,
          })),
        },
      },
      select: { id: true },
    });
  } catch (e) {
    // Course entre deux conversions simultanées : l'index UNIQUE sur
    // source_quote_id garantit qu'une seule gagne — l'autre atterrit ici.
    if (isUniqueViolation(e)) {
      return { error: "Ce devis a déjà été converti en facture." };
    }
    return {
      error: "Impossible de convertir ce devis. Réessayez dans un instant.",
    };
  }

  revalidatePath("/factures");
  revalidatePath("/devis");
  return { id: created.id };
}

// --- Reprise d'un brouillon dans l'éditeur (issue #61) -------------------------

export type DraftForEditor = {
  id: string;
  type: DocType;
  projectId: string;
  object: string | null;
  sourceQuoteNumber: string | null; // devis d'origine si issu d'une conversion
  lines: {
    label: string;
    quantity: number;
    unitPriceCents: number;
    tvaRate: number;
  }[];
};

// Charge un BROUILLON de l'utilisateur courant pour l'ouvrir dans l'éditeur
// (`/documents/nouveau?document=<id>`). Un document émis n'est jamais rechargé
// ici (numéro figé) : null, comme un id inconnu ou celui d'autrui.
export async function getDraftForEditor(
  id: string,
): Promise<DraftForEditor | null> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) return null;

  const doc = await prisma.document.findFirst({
    where: { id, userId, status: "brouillon" },
    select: {
      id: true,
      type: true,
      projectId: true,
      object: true,
      sourceQuote: { select: { number: true } },
      lines: {
        select: {
          label: true,
          quantity: true,
          unitPriceCents: true,
          tvaRate: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!doc) return null;

  return {
    id: doc.id,
    type: doc.type as DocType,
    projectId: doc.projectId,
    object: doc.object,
    sourceQuoteNumber: doc.sourceQuote?.number ?? null,
    lines: doc.lines.map((l) => ({
      label: l.label,
      quantity: Number(l.quantity),
      unitPriceCents: l.unitPriceCents,
      tvaRate: Number(l.tvaRate),
    })),
  };
}
