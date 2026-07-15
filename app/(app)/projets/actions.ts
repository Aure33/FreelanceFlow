"use server";

// Server actions du CRUD Projets (issue #6). Même patron de sécurité que le
// CRUD Clients (#5), dont il s'inspire.
//
// SÉCURITÉ (non négociable) : Prisma CONTOURNE la RLS Postgres. CHAQUE requête
// ci-dessous filtre donc explicitement par utilisateur (where: { userId }) et
// n'est exécutée qu'après requireUserId() (session vérifiée côté serveur).
// Aucune requête globale. Toutes les entrées sont validées avec zod.
//
// Un projet appartient à UN client, lui-même rattaché à l'utilisateur. À la
// création, on VÉRIFIE que le clientId visé appartient bien à l'utilisateur
// courant AVANT d'insérer : on n'attache jamais un projet au client d'autrui.
//
// ÉCO-CONCEPTION : select explicites (jamais l'objet entier), tri en base,
// pagination serveur skip/take + tri/filtre paramétrés (issue #70).
//
// Les messages d'erreur renvoyés sont en français et NE contiennent jamais de
// détail technique (stack, SQL).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { PAGE_SIZE, paginate, type Paginated } from "@/lib/pagination";

// --- Types exposés à l'UI ----------------------------------------------------

// Statuts métier tels que stockés en base (défaut : en_cours).
export type ProjectStatus = "en_cours" | "termine" | "en_pause";

// Ligne de la liste Projets. Les agrégats financiers (budget, facturé, reste) et
// le nombre de documents rattachés N'EXISTENT PAS encore : le CRUD documents est
// l'issue #8. On renvoie des valeurs neutres (0) — surtout PAS de fausses
// données — à brancher plus tard.
export type ProjectListItem = {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  clientName: string;
  createdAt: Date;
  // Stubs #8 (documents pas encore modélisés côté métier)
  documentsCount: 0;
  invoicedCents: 0;
  budgetCents: 0;
};

export type ProjectDetail = {
  id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  notes: string | null;
  createdAt: Date;
  clientId: string;
  clientName: string;
  // Stubs #8
  documentsCount: 0;
  invoicedCents: 0;
  budgetCents: 0;
};

export type CreateProjectInput = {
  name: string;
  clientId: string;
  notes?: string;
};

// Option du sélecteur « Client » de la modale de création.
export type ClientOption = { id: string; name: string };

// Résultat d'échec d'une action de formulaire (le succès redirige / revalide).
export type ActionState = { error: string };

// --- Validation --------------------------------------------------------------

// Champ texte optionnel : trim, et "" -> undefined (on ne stocke pas de vide).
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Le titre de la mission est requis."),
  clientId: z
    .string({ error: "Le client est requis." })
    .uuid("Client invalide."),
  notes: optionalText,
});

// Édition (#58) : titre, notes et statut. PAS de clientId — le rattachement
// d'un projet à son client est structurel (les documents émis du projet
// affichent ce client : le re-parenter réécrirait leur historique).
const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Le titre de la mission est requis."),
  notes: optionalText,
  status: z.enum(["en_cours", "termine", "en_pause"], {
    error: "Statut invalide.",
  }),
});

// Normalise un statut inconnu vers la valeur par défaut (sécurité de typage
// côté lecture : la base ne contraint pas l'enum, on garantit le type exposé).
function normalizeStatus(value: string): ProjectStatus {
  return value === "termine" || value === "en_pause" ? value : "en_cours";
}

// --- Lectures ----------------------------------------------------------------

// Tri exposé par la liste Projets (maquette : chip « Trier »). « recent » =
// activité récente (createdAt desc, défaut) ; « nom » = alphabétique.
export type ProjectSort = "recent" | "nom";

// Filtre de statut de la liste Projets (chips de la vue grille).
export type ProjectFilter = "all" | "en_cours" | "termine";

// Compteurs par statut (chips grille + badges des colonnes Kanban), tous
// statuts confondus — calculés côté base (groupBy), jamais en chargeant tout.
export type ProjectCounts = {
  all: number;
  en_cours: number;
  termine: number;
  en_pause: number;
};

function parseProjectSort(raw: string | string[] | undefined): ProjectSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "nom" ? "nom" : "recent";
}

function parseProjectFilter(raw: string | string[] | undefined): ProjectFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "en_cours" || v === "termine" ? v : "all";
}

// Projets de l'utilisateur courant, PAGINÉS / TRIÉS / FILTRÉS (issue #70).
// Le nom du client est récupéré via la relation (select imbriqué minimal).
export async function listProjects(
  opts: {
    page?: string | string[];
    status?: string | string[];
    sort?: string | string[];
  } = {},
): Promise<Paginated<ProjectListItem>> {
  const userId = await requireUserId();

  const filter = parseProjectFilter(opts.status);
  const sort = parseProjectSort(opts.sort);
  const where: Prisma.ProjectWhereInput = {
    userId,
    ...(filter === "all" ? {} : { status: filter }),
  };
  const orderBy: Prisma.ProjectOrderByWithRelationInput =
    sort === "nom" ? { name: "asc" } : { createdAt: "desc" };

  const total = await prisma.project.count({ where });
  const pagination = paginate(opts.page, total, PAGE_SIZE.projects);

  const rows = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      progress: true,
      createdAt: true,
      client: { select: { name: true } },
    },
    orderBy,
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  const items = rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: normalizeStatus(p.status),
    progress: p.progress,
    clientName: p.client.name,
    createdAt: p.createdAt,
    documentsCount: 0 as const,
    invoicedCents: 0 as const,
    budgetCents: 0 as const,
  }));

  return { items, pagination };
}

// Compteurs par statut (tous, en cours, terminés, en pause) via un seul
// groupBy — nourrit les chips de la grille ET les badges du Kanban.
export async function getProjectCounts(): Promise<ProjectCounts> {
  const userId = await requireUserId();
  const groups = await prisma.project.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  const byStatus = (s: ProjectStatus) =>
    groups
      .filter((g) => normalizeStatus(g.status) === s)
      .reduce((n, g) => n + g._count._all, 0);
  const en_cours = byStatus("en_cours");
  const termine = byStatus("termine");
  const en_pause = byStatus("en_pause");
  return { all: en_cours + termine + en_pause, en_cours, termine, en_pause };
}

// Fiche d'un projet. findFirst + filtre userId (JAMAIS findUnique sans userId) :
// un id d'un autre utilisateur renvoie null (isolation garantie côté app).
export async function getProject(id: string): Promise<ProjectDetail | null> {
  const userId = await requireUserId();

  // id invalide (non-UUID) : on ne tente même pas la requête.
  if (!z.string().uuid().safeParse(id).success) {
    return null;
  }

  const row = await prisma.project.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      status: true,
      progress: true,
      notes: true,
      createdAt: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    status: normalizeStatus(row.status),
    progress: row.progress,
    notes: row.notes,
    createdAt: row.createdAt,
    clientId: row.clientId,
    clientName: row.client.name,
    documentsCount: 0,
    invoicedCents: 0,
    budgetCents: 0,
  };
}

// Clients de l'utilisateur pour peupler le sélecteur de la modale de création.
// Select minimal (id + name) et filtré userId : plus léger que listClients().
export async function listClientOptions(): Promise<ClientOption[]> {
  const userId = await requireUserId();

  return prisma.client.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// --- Écriture ----------------------------------------------------------------

// Crée un projet pour l'utilisateur courant puis redirige vers sa fiche.
// En cas d'entrée invalide, renvoie { error } (message FR, sans détail technique).
export async function createProject(
  input: CreateProjectInput,
): Promise<ActionState> {
  const userId = await requireUserId();

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  // SÉCURITÉ CRITIQUE : le client visé doit appartenir à l'utilisateur courant.
  // On le vérifie côté serveur AVANT toute insertion — sinon on rattacherait un
  // projet au client d'un autre utilisateur (fuite d'isolation). Le filtre
  // userId ici est ce qui garantit l'appartenance.
  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, userId },
    select: { id: true },
  });
  if (!client) {
    return { error: "Client introuvable." };
  }

  let created;
  try {
    created = await prisma.project.create({
      data: {
        userId,
        clientId: client.id,
        name: parsed.data.name,
        notes: parsed.data.notes ?? null,
        // status ("en_cours") et progress (0) : valeurs par défaut du schéma.
      },
      select: { id: true },
    });
  } catch {
    // On n'expose jamais l'erreur brute (SQL, contrainte) au client.
    return {
      error: "Impossible d'enregistrer le projet. Réessayez dans un instant.",
    };
  }

  revalidatePath("/projets");
  // redirect() lève NEXT_REDIRECT : à placer HORS du try/catch.
  redirect(`/projets/${created.id}`);
}

export type UpdateProjectInput = {
  name: string;
  notes?: string;
  status: ProjectStatus;
};

// Met à jour un projet de l'utilisateur courant (issue #58).
// updateMany + filtre { id, userId } : si l'id n'existe pas OU appartient à un
// autre utilisateur, 0 ligne est touchée → « Projet introuvable. » sans jamais
// révéler si l'id existe chez autrui (même réponse dans les deux cas).
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ActionState | undefined> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Projet introuvable." };
  }

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  let count = 0;
  try {
    ({ count } = await prisma.project.updateMany({
      where: { id, userId },
      data: {
        name: parsed.data.name,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
      },
    }));
  } catch {
    return {
      error: "Impossible d'enregistrer les modifications. Réessayez dans un instant.",
    };
  }
  if (count === 0) {
    return { error: "Projet introuvable." };
  }

  revalidatePath("/projets");
  revalidatePath(`/projets/${id}`);
  return undefined;
}

// Supprime un projet de l'utilisateur courant (issue #58) puis redirige vers
// la liste. Garde d'intégrité : la contrainte RESTRICT (projects ← documents)
// interdit de supprimer un projet qui a des documents (des pièces émises ont
// une valeur légale) — pré-vérification pour un message clair + rattrapage de
// l'erreur de contrainte (course possible).
export async function deleteProject(id: string): Promise<ActionState> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Projet introuvable." };
  }

  const documentsCount = await prisma.document.count({
    where: { projectId: id, userId },
  });
  if (documentsCount > 0) {
    return {
      error: `Ce projet a ${documentsCount} document${documentsCount > 1 ? "s" : ""} rattaché${documentsCount > 1 ? "s" : ""} (devis ou factures) — il ne peut pas être supprimé.`,
    };
  }

  let count = 0;
  try {
    ({ count } = await prisma.project.deleteMany({ where: { id, userId } }));
  } catch {
    return {
      error: "Ce projet a des documents rattachés — il ne peut pas être supprimé.",
    };
  }
  if (count === 0) {
    return { error: "Projet introuvable." };
  }

  revalidatePath("/projets");
  // redirect() lève NEXT_REDIRECT : à placer HORS du try/catch.
  redirect("/projets");
}
