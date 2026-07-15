// Pagination serveur (issue #70) — logique PURE, testée unitairement.
//
// Convention : la page est portée par l'URL (`?page=`), 1-indexée pour l'humain.
// `skip` Prisma se déduit de (page - 1) * pageSize. Toute entrée hors bornes ou
// non numérique est ramenée à une page valide (jamais d'erreur, jamais de skip
// négatif) — robustesse face aux URL forgées à la main.

// Tailles de page par liste. Volontairement modestes (éco-conception : on ne
// charge qu'un écran de données à la fois, cf. conventions du projet).
export const PAGE_SIZE = {
  clients: 10,
  documents: 10,
  projects: 12, // multiple de 3 : grille 3 colonnes pleine
} as const;

// Enveloppe de résultat paginé renvoyée par les server actions de liste.
export type Paginated<T> = { items: T[]; pagination: Pagination };

export type Pagination = {
  page: number; // page courante, 1-indexée, garantie dans [1, totalPages]
  pageSize: number;
  total: number; // nombre total d'éléments (tous filtres appliqués)
  totalPages: number; // au moins 1 (une liste vide = 1 page vide)
  skip: number; // décalage Prisma
};

// Nombre de pages pour `total` éléments (au minimum 1, même à 0 élément).
export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

// Normalise une valeur de page issue de l'URL vers un entier de [1, maxPages].
// Accepte string | string[] | undefined (forme des searchParams Next).
export function parsePage(
  raw: string | string[] | undefined,
  maxPages: number,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  const max = Math.max(1, maxPages);
  return Math.min(n, max);
}

// Construit l'objet de pagination complet à partir du total connu et de la page
// demandée (brute). `skip` est prêt pour Prisma.
export function paginate(
  rawPage: string | string[] | undefined,
  total: number,
  pageSize: number,
): Pagination {
  const pages = totalPages(total, pageSize);
  const page = parsePage(rawPage, pages);
  return {
    page,
    pageSize,
    total,
    totalPages: pages,
    skip: (page - 1) * pageSize,
  };
}
