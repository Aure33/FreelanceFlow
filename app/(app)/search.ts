"use server";

// Recherche globale ⌘K (issue #63) — server action unique appelée (débouncée)
// par la palette de la topbar.
//
// SÉCURITÉ (non négociable) : requireUserId() puis CHAQUE requête filtrée
// where: { userId } (Prisma bypasse la RLS). Un terme de recherche ne peut
// JAMAIS remonter une donnée d'autrui.
//
// ÉCO-CONCEPTION : 3 requêtes légères en parallèle, `select` minimaux,
// `take` 5 par famille — la palette est un point d'entrée, pas une liste.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

export type SearchResults = {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientName: string }[];
  documents: {
    id: string;
    type: "devis" | "facture";
    number: string;
    clientName: string;
  }[];
};

const EMPTY: SearchResults = { clients: [], projects: [], documents: [] };

// 2 caractères minimum (évite les scans « a » qui matchent tout), 80 max.
const querySchema = z.string().trim().min(2).max(80);

export async function searchAll(rawQuery: string): Promise<SearchResults> {
  const userId = await requireUserId();

  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) return EMPTY;
  const q = parsed.data;

  const [clients, projects, documents] = await Promise.all([
    prisma.client.findMany({
      where: { userId, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.project.findMany({
      where: { userId, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Documents : recherche sur le NUMÉRO (FAC-/DEV-) — les brouillons n'en
    // ont pas encore et ne remontent donc pas ici (ils se retrouvent par
    // leur projet ou leur client).
    prisma.document.findMany({
      where: {
        userId,
        number: { not: null, contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        type: true,
        number: true,
        project: { select: { client: { select: { name: true } } } },
      },
      orderBy: { number: "desc" },
      take: 5,
    }),
  ]);

  return {
    clients,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client.name,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      type: d.type === "devis" ? "devis" : "facture",
      // `number` non-null garanti par la clause where.
      number: d.number as string,
      clientName: d.project.client.name,
    })),
  };
}
