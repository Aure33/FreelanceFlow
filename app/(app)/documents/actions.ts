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

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { tvaRegime: true },
  });
  const regime = normalizeRegime(me?.tvaRegime);
  const lns = normalizedLines(lines, regime);
  const totals = computeTotals(lns);
  const issued = issuedAt ?? new Date();
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
