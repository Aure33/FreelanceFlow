"use server";

// Server actions du CRUD Clients (issue #5).
//
// SÉCURITÉ (non négociable) : Prisma CONTOURNE la RLS Postgres. CHAQUE requête
// ci-dessous filtre donc explicitement par utilisateur (where: { userId }) et
// n'est exécutée qu'après requireUserId() (session vérifiée côté serveur).
// Aucune requête globale. Toutes les entrées sont validées avec zod.
//
// ÉCO-CONCEPTION : select explicites (jamais l'objet entier), tri en base,
// pagination serveur skip/take (issue #70 — on ne charge qu'un écran).
//
// Les messages d'erreur renvoyés sont en français et NE contiennent jamais de
// détail technique (stack, SQL).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { PAGE_SIZE, paginate, type Paginated } from "@/lib/pagination";

// --- Types exposés à l'UI ----------------------------------------------------

// Ligne de la liste Clients. Les agrégats liés aux documents (dernier document,
// CA total, solde en attente) N'EXISTENT PAS encore : le CRUD documents est
// l'issue #7. On renvoie des valeurs neutres (0 / null) — surtout PAS de
// fausses données — à brancher plus tard.
export type ClientListItem = {
  id: string;
  name: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  sector: string | null;
  createdAt: Date;
  // Stubs #7 (documents pas encore modélisés côté métier)
  lastDocumentAt: null;
  caTotalCents: 0;
  pendingCents: 0;
};

export type ClientDetail = {
  id: string;
  name: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  sector: string | null;
  paymentTerms: string | null;
  iban: string | null;
  bic: string | null;
  createdAt: Date;
};

export type CreateClientInput = {
  name: string;
  siret?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
  sector?: string;
};

// Résultat d'échec d'une action de formulaire (le succès redirige / revalide).
export type ActionState = { error: string };

// Résultat de la vérification SIRET auprès de l'API publique de l'État.
export type SiretLookupResult = {
  verified: boolean;
  name?: string;
  address?: string;
};

// Suggestion de recherche d'entreprise par nom (annuaire-entreprises).
export type CompanySearchItem = {
  siret: string;
  name: string;
  address?: string;
  city?: string;
};

// --- Validation --------------------------------------------------------------

// "842 519 637 00021" -> "84251963700021". Chaîne vide -> undefined.
function normalizeSiret(value: string | undefined): string | undefined {
  const digits = value?.replace(/\s+/g, "");
  return digits && digits.length > 0 ? digits : undefined;
}

// Champ texte optionnel : trim, et "" -> undefined (on ne stocke pas de vide).
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Le nom du client est requis."),
  siret: z
    .string()
    .optional()
    .transform(normalizeSiret)
    .refine(
      (v) => v === undefined || /^\d{14}$/.test(v),
      "Le SIRET doit comporter 14 chiffres.",
    ),
  email: optionalText.refine(
    (v) => v === undefined || z.string().email().safeParse(v).success,
    "Adresse e-mail invalide.",
  ),
  phone: optionalText,
  address: optionalText,
  paymentTerms: optionalText,
  sector: optionalText,
});

// --- Lectures ----------------------------------------------------------------

// Clients de l'utilisateur courant, triés par nom, PAGINÉS (issue #70).
// `count` + `findMany(skip/take)` en parallèle : on ne charge qu'un écran.
export async function listClients(
  rawPage?: string | string[],
): Promise<Paginated<ClientListItem>> {
  const userId = await requireUserId();

  const total = await prisma.client.count({ where: { userId } });
  const pagination = paginate(rawPage, total, PAGE_SIZE.clients);

  const rows = await prisma.client.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      siret: true,
      email: true,
      phone: true,
      sector: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  const items = rows.map((c) => ({
    ...c,
    lastDocumentAt: null as null,
    caTotalCents: 0 as const,
    pendingCents: 0 as const,
  }));

  return { items, pagination };
}

// Fiche d'un client. findFirst + filtre userId (JAMAIS findUnique sans userId) :
// un id d'un autre utilisateur renvoie null (isolation garantie côté app).
export async function getClient(id: string): Promise<ClientDetail | null> {
  const userId = await requireUserId();

  // id invalide (non-UUID) : on ne tente même pas la requête.
  if (!z.string().uuid().safeParse(id).success) {
    return null;
  }

  return prisma.client.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      siret: true,
      email: true,
      phone: true,
      address: true,
      sector: true,
      paymentTerms: true,
      iban: true,
      bic: true,
      createdAt: true,
    },
  });
}

// --- Écriture ----------------------------------------------------------------

// Crée un client pour l'utilisateur courant puis redirige vers sa fiche.
// En cas d'entrée invalide, renvoie { error } (message FR, sans détail technique).
export async function createClient(
  input: CreateClientInput,
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  let created;
  try {
    created = await prisma.client.create({
      data: {
        userId,
        name: parsed.data.name,
        siret: parsed.data.siret ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        paymentTerms: parsed.data.paymentTerms ?? null,
        sector: parsed.data.sector ?? null,
      },
      select: { id: true },
    });
  } catch {
    // On n'expose jamais l'erreur brute (SQL, contrainte) au client.
    return {
      error: "Impossible d'enregistrer le client. Réessayez dans un instant.",
    };
  }

  revalidatePath("/clients");
  // redirect() lève NEXT_REDIRECT : à placer HORS du try/catch.
  redirect(`/clients/${created.id}`);
}

// Met à jour un client de l'utilisateur courant (issue #58).
// updateMany + filtre { id, userId } : si l'id n'existe pas OU appartient à un
// autre utilisateur, 0 ligne est touchée → « Client introuvable. » sans jamais
// révéler si l'id existe chez autrui (même réponse dans les deux cas).
// Succès : revalide liste + fiche, renvoie undefined (la modale se ferme et
// rafraîchit côté client).
export async function updateClient(
  id: string,
  input: CreateClientInput,
): Promise<ActionState | undefined> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Client introuvable." };
  }

  // Même schéma que la création : mêmes règles, mêmes messages.
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  let count = 0;
  try {
    ({ count } = await prisma.client.updateMany({
      where: { id, userId },
      data: {
        name: parsed.data.name,
        siret: parsed.data.siret ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        paymentTerms: parsed.data.paymentTerms ?? null,
      },
    }));
  } catch {
    return {
      error: "Impossible d'enregistrer les modifications. Réessayez dans un instant.",
    };
  }
  if (count === 0) {
    return { error: "Client introuvable." };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return undefined;
}

// Supprime un client de l'utilisateur courant (issue #58) puis redirige vers
// la liste. Garde d'intégrité : la contrainte RESTRICT (clients ← projects)
// interdit de supprimer un client qui a des projets — on pré-vérifie pour un
// message clair, et on rattrape aussi l'erreur de contrainte (course possible
// entre la vérification et la suppression).
export async function deleteClient(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Client introuvable." };
  }

  const projectsCount = await prisma.project.count({
    where: { clientId: id, userId },
  });
  if (projectsCount > 0) {
    return {
      error: `Ce client a ${projectsCount} projet${projectsCount > 1 ? "s" : ""} rattaché${projectsCount > 1 ? "s" : ""} — supprimez-les d'abord.`,
    };
  }

  let count = 0;
  try {
    ({ count } = await prisma.client.deleteMany({ where: { id, userId } }));
  } catch {
    // Contrainte RESTRICT levée malgré la pré-vérification (course) ou autre
    // erreur : même message d'intégrité, jamais le détail SQL.
    return {
      error: "Ce client a des projets rattachés — supprimez-les d'abord.",
    };
  }
  if (count === 0) {
    return { error: "Client introuvable." };
  }

  revalidatePath("/clients");
  // redirect() lève NEXT_REDIRECT : à placer HORS du try/catch.
  redirect("/clients");
}

// --- Vérification SIRET (API publique gratuite de l'État) ---------------------

// Recherche d'entreprises (annuaire-entreprises) — appel SERVEUR, sans clé.
// https://recherche-entreprises.api.gouv.fr/search?q=<siret>
// Renvoie { verified, name?, address? }. Toute erreur réseau / réponse
// inattendue => { verified: false } (ne plante jamais l'action).
export async function lookupSiret(siret: string): Promise<SiretLookupResult> {
  // Authentification requise : appel réservé aux utilisateurs connectés
  // (évite d'exposer un proxy d'API ouvert).
  await requireUserId();

  const normalized = normalizeSiret(siret);
  if (!normalized || !/^\d{14}$/.test(normalized)) {
    return { verified: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${normalized}&per_page=1`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { verified: false };

    const data = (await res.json()) as {
      results?: Array<{
        nom_complet?: string;
        nom_raison_sociale?: string;
        siege?: { adresse?: string };
        matching_etablissements?: Array<{ siret?: string; adresse?: string }>;
      }>;
    };

    const first = data.results?.[0];
    if (!first) return { verified: false };

    const name = first.nom_complet || first.nom_raison_sociale || undefined;
    // Adresse de l'établissement EXACT recherché si disponible (plus précis que
    // le siège pour un établissement secondaire), sinon repli sur le siège.
    const matched = first.matching_etablissements?.find(
      (e) => e.siret === normalized,
    );
    const address =
      matched?.adresse ||
      first.matching_etablissements?.[0]?.adresse ||
      first.siege?.adresse ||
      undefined;

    return { verified: true, name, address };
  } catch {
    // Timeout / réseau / JSON invalide : dégradation silencieuse.
    return { verified: false };
  } finally {
    clearTimeout(timeout);
  }
}

// Recherche d'entreprises par NOM (ou tout texte) — même API gratuite, appel
// SERVEUR sans clé. Renvoie jusqu'à 6 suggestions (siret du siège + nom +
// adresse + ville). Toute erreur => liste vide (ne plante jamais).
export async function searchCompanies(
  query: string,
): Promise<CompanySearchItem[]> {
  await requireUserId();

  const q = query.trim();
  if (q.length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(
        q,
      )}&page=1&per_page=6`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: Array<{
        nom_complet?: string;
        nom_raison_sociale?: string;
        siege?: { siret?: string; adresse?: string; libelle_commune?: string };
      }>;
    };

    const items: CompanySearchItem[] = [];
    for (const r of data.results ?? []) {
      const siret = r.siege?.siret;
      const name = r.nom_complet || r.nom_raison_sociale;
      if (siret && name) {
        items.push({
          siret,
          name,
          address: r.siege?.adresse || undefined,
          city: r.siege?.libelle_commune || undefined,
        });
      }
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
