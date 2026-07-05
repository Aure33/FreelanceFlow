"use server";

// Server actions de la page Paramètres (issue #12) — profil / TVA / relances /
// apparence.
//
// SCOPE (décision déjà prise, cf. CLAUDE.md #12 & issue) : comme pour les
// Clients (#5), on SIMPLIFIE les champs de la maquette Profil.html qui ne sont
// pas modélisés en base et hors critères d'acceptation : PAS de "Nom
// commercial", "Forme juridique", "N° TVA intracommunautaire", "Code APE",
// "Taux TVA par défaut", "Exigibilité", "Titulaire IBAN", "Conditions de
// paiement par défaut" éditable, "Format de numérotation" éditable. On reste
// sur les champs déjà modélisés dans prisma/schema.prisma (model User) :
// name, activity, phone, address, siret, tvaRegime, iban, bic, planType,
// email (immuable, vient de l'auth).
//
// SÉCURITÉ (non négociable) : Prisma CONTOURNE la RLS Postgres. CHAQUE requête
// filtre explicitement par utilisateur (where: { id: userId } / { userId }),
// après requireUserId() (session vérifiée côté serveur). Entrées validées avec
// zod, jamais de confiance dans les données du client. Messages d'erreur en
// français, sans détail technique (stack, SQL).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { documentPrefix, nextNumber, type TvaRegime } from "@/lib/invoicing";

// --- Types exposés à l'UI ----------------------------------------------------

export type ProfileData = {
  email: string;
  name: string | null;
  activity: string | null;
  phone: string | null;
  address: string | null;
  siret: string | null;
  iban: string | null;
  bic: string | null;
  tvaRegime: TvaRegime;
  planType: "free" | "premium";
  nextDocumentNumber: string; // aperçu en LECTURE SEULE, ex. "FAC-2026-006" — ne consomme/réserve RIEN
};

export type UpdateProfileInput = Partial<{
  name: string;
  activity: string;
  phone: string;
  address: string;
  siret: string;
  iban: string;
  bic: string;
  tvaRegime: TvaRegime;
}>;

export type UpdateProfileResult = { ok: true } | { error: string };

// --- Normalisation / validation ----------------------------------------------

// Sécurise le régime lu en base vers l'union typée (défaut : reel) — même
// logique que normalizeRegime() dans documents/actions.ts.
function normalizeRegime(value: string | null | undefined): TvaRegime {
  return value === "franchise" || value === "normal" ? value : "reel";
}

// Sécurise le plan lu en base (défaut : free, jamais confiance aveugle).
function normalizePlan(value: string | null | undefined): "free" | "premium" {
  return value === "premium" ? "premium" : "free";
}

// "842 519 637 00021" -> "84251963700021". Chaîne vide -> undefined.
// Même règle que app/(app)/clients/actions.ts (normalizeSiret).
function normalizeSiret(value: string | undefined): string | undefined {
  const digits = value?.replace(/\s+/g, "");
  return digits && digits.length > 0 ? digits : undefined;
}

// Champ texte optionnel : trim, "" -> null (on ne stocke pas de chaîne vide).
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const ibanRe = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const bicRe = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom ne peut pas être vide.")
    .optional(),
  activity: optionalText,
  phone: optionalText,
  address: optionalText,
  siret: z
    .string()
    .optional()
    .transform(normalizeSiret)
    .refine(
      (v) => v === undefined || /^\d{14}$/.test(v),
      "Le SIRET doit comporter 14 chiffres.",
    ),
  iban: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : undefined))
    .refine(
      (v) => v === undefined || ibanRe.test(v),
      "IBAN invalide (format attendu : 2 lettres pays + 2 chiffres + jusqu'à 30 caractères alphanumériques).",
    ),
  bic: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : undefined))
    .refine(
      (v) => v === undefined || bicRe.test(v),
      "BIC invalide (format attendu : 8 ou 11 caractères, ex. BNPAFRPPXXX).",
    ),
  tvaRegime: z.enum(["franchise", "reel", "normal"]).optional(),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Formulaire invalide.";
}

// --- Lecture -----------------------------------------------------------------

// Profil de l'utilisateur courant. nextDocumentNumber : aperçu en LECTURE
// SEULE du prochain numéro de FACTURE pour l'année en cours — réutilise les
// fonctions PURES documentPrefix()/nextNumber() de lib/invoicing (même
// logique que emitDocument() dans documents/actions.ts), à partir des numéros
// déjà émis. Aucune écriture, aucune réservation.
export async function getProfile(): Promise<ProfileData> {
  const userId = await requireUserId();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      activity: true,
      phone: true,
      address: true,
      siret: true,
      iban: true,
      bic: true,
      tvaRegime: true,
      planType: true,
    },
  });

  // requireUserId() garantit une session Supabase valide ; le trigger
  // on_auth_user_created crée toujours la ligne public.users correspondante.
  if (!user) {
    throw new Error("Profil introuvable.");
  }

  const type = "facture" as const;
  const year = new Date().getUTCFullYear();
  const prefix = documentPrefix(type);

  const existing = await prisma.document.findMany({
    where: { userId, type, number: { startsWith: `${prefix}-${year}-` } },
    select: { number: true },
  });
  const nextDocumentNumber = nextNumber(
    type,
    year,
    existing.map((d) => d.number),
  );

  return {
    email: user.email,
    name: user.name,
    activity: user.activity,
    phone: user.phone,
    address: user.address,
    siret: user.siret,
    iban: user.iban,
    bic: user.bic,
    tvaRegime: normalizeRegime(user.tvaRegime),
    planType: normalizePlan(user.planType),
    nextDocumentNumber,
  };
}

// --- Écriture ----------------------------------------------------------------

// Met à jour le profil de l'utilisateur courant. Chaque carte de la page
// n'envoie que ses propres champs (Partial) : les clés absentes ne sont pas
// touchées. Une clé fournie avec "" est stockée à null (sauf name, qui refuse
// la chaîne vide).
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const userId = await requireUserId();

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }
  const data = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(input, "name") && data.name !== undefined) {
    updateData.name = data.name;
  }
  if (Object.prototype.hasOwnProperty.call(input, "activity")) {
    updateData.activity = data.activity;
  }
  if (Object.prototype.hasOwnProperty.call(input, "phone")) {
    updateData.phone = data.phone;
  }
  if (Object.prototype.hasOwnProperty.call(input, "address")) {
    updateData.address = data.address;
  }
  if (Object.prototype.hasOwnProperty.call(input, "siret")) {
    updateData.siret = data.siret ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "iban")) {
    updateData.iban = data.iban ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "bic")) {
    updateData.bic = data.bic ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "tvaRegime")) {
    updateData.tvaRegime = data.tvaRegime;
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: true };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  } catch {
    // On n'expose jamais l'erreur brute (SQL, contrainte) au client.
    return {
      error: "Impossible d'enregistrer les modifications. Réessayez dans un instant.",
    };
  }

  revalidatePath("/parametres");
  // Le profil alimente l'émetteur des documents déjà émis (nom, adresse,
  // SIRET, IBAN, BIC) : on revalide les vues qui l'affichent.
  revalidatePath("/factures");
  revalidatePath("/devis");
  return { ok: true };
}
