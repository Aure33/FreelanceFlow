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

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { PAGE_SIZE, paginate, type Paginated } from "@/lib/pagination";
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

// Filtre de statut d'une liste (issue #70) : « all » ou un statut EFFECTIF.
export type DocumentFilter = "all" | DocumentStatus;

// Ids de filtres autorisés par type (usage SERVEUR uniquement — un fichier
// "use server" ne peut exporter que des fonctions async, donc pas d'export).
// « en_retard » n'existe que pour les factures (statut dérivé).
const DOCUMENT_FILTERS: Record<DocType, DocumentFilter[]> = {
  facture: ["all", "paye", "envoye", "en_retard", "brouillon"],
  devis: ["all", "brouillon", "envoye", "accepte", "refuse"],
};

// Compteurs par filtre (chips + notes du bandeau) + méta d'en-tête. Calculés
// CÔTÉ BASE (count par clause), jamais en chargeant les lignes.
export type DocumentCounts = {
  counts: Record<DocumentFilter, number>; // « all » = total tous statuts
  lastIssuedAt: Date | null; // dernière pièce émise (numéro attribué)
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
  emailSentAt: Date | null; // dernier envoi par e-mail au client (#83)
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
    email: string | null; // pré-remplissage du destinataire (#83)
  };
  project: { id: string; name: string };
  lines: DocumentLineView[];
  totalHtCents: number;
  totalTvaCents: number;
  totalTtcCents: number;
  legalMentions: string[]; // mentions légales déduites (type + régime)
  publicToken: string | null; // lien public de devis (#85) — null si non partagé
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

// Clause `where` d'un filtre de statut EFFECTIF (issue #70) — source unique
// partagée par la liste paginée ET les compteurs, pour qu'ils restent cohérents.
// « en_retard » et « en attente » se traduisent en clauses sur (status, dueAt)
// exactement comme effectiveStatus() / les agrégats du bandeau.
function statusFilterWhere(
  type: DocType,
  filter: DocumentFilter,
  now: Date,
): Prisma.DocumentWhereInput {
  if (filter === "all") return {};
  if (type === "facture") {
    switch (filter) {
      case "en_retard":
        return { status: "envoye", paidAt: null, dueAt: { lt: now } };
      case "envoye": // « En attente » : envoyée NON échue
        return {
          status: "envoye",
          paidAt: null,
          OR: [{ dueAt: null }, { dueAt: { gte: now } }],
        };
      default: // paye | brouillon (accepte/refuse impossibles sur facture)
        return { status: filter };
    }
  }
  // Devis : pas de dérivation, correspondance directe de statut.
  return { status: filter };
}

// Normalise le paramètre `?statut=` d'URL vers un filtre autorisé (défaut all).
function parseDocumentFilter(
  type: DocType,
  raw: string | string[] | undefined,
): DocumentFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const allowed = DOCUMENT_FILTERS[type];
  return (allowed as string[]).includes(value ?? "")
    ? (value as DocumentFilter)
    : "all";
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
  opts: { page?: string | string[]; status?: string | string[] } = {},
): Promise<Paginated<DocumentListItem>> {
  const userId = await requireUserId();
  const now = new Date();

  const filter = parseDocumentFilter(type, opts.status);
  const where: Prisma.DocumentWhereInput = {
    userId,
    type,
    ...statusFilterWhere(type, filter, now),
  };

  const total = await prisma.document.count({ where });
  const pagination = paginate(opts.page, total, PAGE_SIZE.documents);

  const rows = await prisma.document.findMany({
    where,
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
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  const items = rows.map((d) => ({
    id: d.id,
    number: d.number,
    clientName: d.project.client.name,
    object: d.object,
    status: effectiveStatus(d, now),
    issuedAt: d.issuedAt,
    dueAt: d.dueAt,
    totalTtcCents: d.totalTtcCents,
  }));

  return { items, pagination };
}

// Compteurs par filtre (chips + notes du bandeau) + dernière pièce émise.
// Un count() par filtre, en parallèle, avec les MÊMES clauses que la liste
// (statusFilterWhere) → chips et liste toujours d'accord. Éco : des count()
// indexés, jamais de chargement de lignes.
export async function getDocumentCounts(
  type: DocType,
): Promise<DocumentCounts> {
  const userId = await requireUserId();
  const now = new Date();
  const filters = DOCUMENT_FILTERS[type];

  const [countsByFilter, lastEmitted] = await Promise.all([
    Promise.all(
      filters.map((f) =>
        prisma.document.count({
          where: { userId, type, ...statusFilterWhere(type, f, now) },
        }),
      ),
    ),
    prisma.document.findFirst({
      where: { userId, type, number: { not: null }, issuedAt: { not: null } },
      orderBy: { issuedAt: "desc" },
      select: { issuedAt: true },
    }),
  ]);

  const counts = {} as Record<DocumentFilter, number>;
  filters.forEach((f, i) => {
    counts[f] = countsByFilter[i];
  });

  return { counts, lastIssuedAt: lastEmitted?.issuedAt ?? null };
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
// SELECT partagé par la lecture authentifiée (getDocument) et publique
// (getPublicQuote) — même vue, seule la clause `where` diffère.
const DOCUMENT_VIEW_SELECT = {
  id: true,
  type: true,
  number: true,
  status: true,
  object: true,
  tvaRegime: true,
  issuedAt: true,
  dueAt: true,
  paidAt: true,
  emailSentAt: true,
  totalHtCents: true,
  totalTvaCents: true,
  totalTtcCents: true,
  publicToken: true,
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
      client: { select: { name: true, address: true, siret: true, email: true } },
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
    orderBy: { position: "asc" as const },
  },
  // Traçabilité conversion (#61).
  sourceQuote: { select: { id: true, number: true } },
  convertedInvoice: { select: { id: true, number: true, status: true } },
} satisfies Prisma.DocumentSelect;

type DocumentViewRow = Prisma.DocumentGetPayload<{
  select: typeof DOCUMENT_VIEW_SELECT;
}>;

// Mapper pur : ligne Prisma (SELECT ci-dessus) -> DocumentView exposé à l'UI.
function toDocumentView(doc: DocumentViewRow, now: Date): DocumentView {
  const type = doc.type as DocType;
  const regime = normalizeRegime(doc.tvaRegime ?? doc.user.tvaRegime);

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
    emailSentAt: doc.emailSentAt,
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
      email: doc.project.client.email,
    },
    project: { id: doc.project.id, name: doc.project.name },
    lines,
    totalHtCents: doc.totalHtCents,
    totalTvaCents: doc.totalTvaCents,
    totalTtcCents: doc.totalTtcCents,
    legalMentions: legalMentions({ type, regime }),
    publicToken: doc.publicToken,
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

// Vue complète d'un document. findFirst + filtre userId : un id d'un autre
// utilisateur (ou un non-UUID) renvoie null — isolation garantie côté app.
export async function getDocument(id: string): Promise<DocumentView | null> {
  const userId = await requireUserId();
  if (!z.string().uuid().safeParse(id).success) return null;

  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: DOCUMENT_VIEW_SELECT,
  });
  if (!doc) return null;
  return toDocumentView(doc, new Date());
}

// --- Lien public de devis (issue #85) ----------------------------------------
// Un devis peut être partagé par une URL tokenisée ; le client l'accepte ou le
// refuse SANS compte. Le jeton EST le secret d'accès (aléatoire, révocable).

const shareTokenSchema = z.string().trim().min(16).max(64);

// Lecture publique d'un devis par son jeton — AUCUNE session. Filtre strict :
// le jeton doit exister ET la pièce doit être un devis (jamais une facture).
export async function getPublicQuote(
  token: string,
): Promise<DocumentView | null> {
  if (!shareTokenSchema.safeParse(token).success) return null;

  const doc = await prisma.document.findFirst({
    where: { publicToken: token, type: "devis" },
    select: DOCUMENT_VIEW_SELECT,
  });
  if (!doc) return null;
  return toDocumentView(doc, new Date());
}

// Réponse publique du client (accepter / refuser) — AUCUNE session, validée par
// le seul jeton. Transition atomique n'autorisée QUE depuis « envoye » :
// updateMany renvoie 0 si le devis n'est pas/plus en attente (déjà tranché,
// jeton révoqué/inexistant) → message neutre, aucune fuite.
export async function respondToQuote(
  token: string,
  decision: "accept" | "refuse",
): Promise<{ ok: true } | { error: string }> {
  if (!shareTokenSchema.safeParse(token).success) {
    return { error: "Lien invalide." };
  }
  const nextStatus = decision === "accept" ? "accepte" : "refuse";

  const res = await prisma.document.updateMany({
    where: { publicToken: token, type: "devis", status: "envoye" },
    data: { status: nextStatus },
  });
  if (res.count === 0) {
    return {
      error:
        "Ce devis a déjà reçu une réponse, ou le lien n'est plus valide.",
    };
  }
  revalidatePath(`/proposition/${token}`);
  return { ok: true };
}

// Crée (ou renvoie) le lien de partage d'un devis — PROPRIÉTAIRE uniquement.
export async function createShareLink(
  id: string,
): Promise<{ token: string } | { error: string }> {
  const userId = await requireUserId();
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Devis introuvable." };
  }

  const doc = await prisma.document.findFirst({
    where: { id, userId },
    select: { type: true, status: true, publicToken: true },
  });
  if (!doc || doc.type !== "devis") {
    return { error: "Seuls les devis peuvent être partagés." };
  }
  if (doc.status === "brouillon") {
    return { error: "Émettez le devis avant de le partager." };
  }
  if (doc.publicToken) return { token: doc.publicToken };

  // Jeton URL-safe imprévisible (24 octets -> 32 caractères base64url).
  const token = randomBytes(24).toString("base64url");
  await prisma.document.updateMany({
    where: { id, userId },
    data: { publicToken: token },
  });
  revalidatePath(`/devis/${id}`);
  return { token };
}

// Révoque le lien de partage (retour à null) — PROPRIÉTAIRE uniquement.
export async function revokeShareLink(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Devis introuvable." };
  }
  await prisma.document.updateMany({
    where: { id, userId, type: "devis" },
    data: { publicToken: null },
  });
  revalidatePath(`/devis/${id}`);
  return { ok: true };
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

// --- Duplication (issue #66) ----------------------------------------------------

export type DuplicateResult = { id: string } | { error: string };

// Duplique N'IMPORTE QUEL document de l'utilisateur (devis ou facture, émis ou
// brouillon) en un nouveau BROUILLON du même type : projet, objet, totaux et
// lignes copiés à l'identique en centimes. PAS de numéro (attribué à
// l'émission), pas de dates d'échéance/paiement, pas de traçabilité
// sourceQuoteId (la duplication n'est pas une conversion) — et le quota
// freemium est intact : un brouillon n'a pas d'emittedAt, seule l'émission
// compte (#10). Contrairement à la conversion, on peut dupliquer sans limite
// (facturation récurrente : la même prestation chaque mois).
export async function duplicateDocument(id: string): Promise<DuplicateResult> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Document introuvable." };
  }

  // Appartenance vérifiée en une requête — même réponse qu'un id inexistant
  // si le document est à autrui (aucune fuite d'existence).
  const source = await prisma.document.findFirst({
    where: { id, userId },
    select: {
      type: true,
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
  if (!source) return { error: "Document introuvable." };

  let created;
  try {
    created = await prisma.document.create({
      data: {
        userId,
        projectId: source.projectId,
        type: source.type,
        status: "brouillon",
        object: source.object,
        issuedAt: new Date(),
        // Totaux copiés (calculés à partir des MÊMES lignes) ; recalculés de
        // toute façon côté serveur à l'enregistrement/émission.
        totalHtCents: source.totalHtCents,
        totalTvaCents: source.totalTvaCents,
        totalTtcCents: source.totalTtcCents,
        lines: {
          create: source.lines.map((l) => ({
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
  } catch {
    return {
      error: "Impossible de dupliquer ce document. Réessayez dans un instant.",
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
