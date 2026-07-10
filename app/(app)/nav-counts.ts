"use server";

// Badges de la sidebar (issue #47) — remplace les compteurs codés en dur de
// components/layout/sidebar.tsx.
//
// La sidebar est rendue par app/(app)/layout.tsx, donc SUR CHAQUE page de
// l'app : cette requête est chargée partout. On la garde LÉGÈRE — 4 simples
// count() côté base, pas de findMany ni de select d'objets.
//
// SÉCURITÉ (non négociable) : requireUserId() en premier, CHAQUE count filtre
// where: { userId } (Prisma CONTOURNE la RLS).
//
// COHÉRENCE avec les listes : devis et factures comptent TOUS les documents du
// type (brouillons inclus), comme les pages /devis et /factures qui affichent
// aussi les brouillons.

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

export type NavCounts = {
  clients: number;
  projets: number;
  devis: number;
  factures: number;
};

export async function getNavCounts(): Promise<NavCounts> {
  const userId = await requireUserId();

  const [clients, projets, devis, factures] = await Promise.all([
    prisma.client.count({ where: { userId } }),
    prisma.project.count({ where: { userId } }),
    prisma.document.count({ where: { userId, type: "devis" } }),
    prisma.document.count({ where: { userId, type: "facture" } }),
  ]);

  return { clients, projets, devis, factures };
}
