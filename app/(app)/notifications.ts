"use server";

// Notifications de la cloche topbar (issue #69). Aucune table dédiée : les
// notifications sont DÉRIVÉES des mêmes événements que le panneau « À traiter »
// du tableau de bord (#47), avec les MÊMES clauses `where` (factures en retard,
// devis sans réponse) — on ne stocke ni ne duplique aucun statut.
//
// SÉCURITÉ (non négociable) : requireUserId() d'abord, chaque requête filtre
// `where: { userId }` (Prisma CONTOURNE la RLS).
//
// ÉCO-CONCEPTION : `getNotifications()` est chargée par app/(app)/layout.tsx,
// donc sur CHAQUE navigation → on la garde LÉGÈRE : 2 findMany bornés (take 12,
// index (userId, type, status)), lancés en parallèle, aucun agrégat lourd.
//
// « Lu / non lu » : persistance simple par cookie `ff-notifs-read-at` (ms epoch,
// per-appareil — même compromis que ff-onboarding-dismissed en #60). Un item est
// « non lu » si son horodatage d'entrée dans le set (`atMs`) est postérieur au
// dernier « tout marquer comme lu ». Pas de schéma, pas de migration.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

const READ_COOKIE = "ff-notifs-read-at";
const QUOTE_STALE_DAYS = 7; // un devis « envoyé » devient « à relancer » après 7 j
const DAY_MS = 86_400_000;
const TAKE = 12; // borne éco par type ; le badge plafonne l'affichage au-delà

export type NotificationKind = "facture_retard" | "devis_relance";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  clientName: string;
  number: string;
  amountTtcCents: number;
  days: number; // jours de retard (facture) ou d'ancienneté d'envoi (devis)
  href: string;
  unread: boolean;
};

export type Notifications = {
  items: NotificationItem[];
  unreadCount: number;
};

// Jours entiers écoulés (from antérieure à to) — même calcul que le dashboard.
function elapsedDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export async function getNotifications(): Promise<Notifications> {
  const userId = await requireUserId();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - QUOTE_STALE_DAYS * DAY_MS);

  const [overdue, stale] = await Promise.all([
    // Factures en retard : « envoye », non payées, échéance dépassée (même
    // clause que KPI 3 / panneau priorité du dashboard).
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        paidAt: null,
        dueAt: { lt: now },
      },
      select: {
        id: true,
        number: true,
        dueAt: true,
        totalTtcCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
      orderBy: { dueAt: "asc" }, // la plus en retard en tête
      take: TAKE,
    }),
    // Devis sans réponse depuis plus de QUOTE_STALE_DAYS jours : « envoye »
    // émis (emittedAt, repli issuedAt) avant le seuil.
    prisma.document.findMany({
      where: {
        userId,
        type: "devis",
        status: "envoye",
        OR: [
          { emittedAt: { lte: staleBefore } },
          { emittedAt: null, issuedAt: { lte: staleBefore } },
        ],
      },
      select: {
        id: true,
        number: true,
        emittedAt: true,
        issuedAt: true,
        totalTtcCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
      orderBy: { emittedAt: "asc" }, // le plus ancien en tête
      take: TAKE,
    }),
  ]);

  const readAtRaw = cookies().get(READ_COOKIE)?.value;
  const readAtMs = readAtRaw ? Number(readAtRaw) : 0;

  // Horodatage d'ENTRÉE dans le set (`atMs`) : moment où l'item est devenu
  // « notifiable » — dueAt pour une facture (devient en retard), seuil des 7 j
  // pour un devis. Sert au tri (plus récent en tête) et au calcul « non lu ».
  type Row = NotificationItem & { atMs: number };

  const overdueRows: Row[] = overdue.map((r) => {
    const atMs = r.dueAt ? r.dueAt.getTime() : 0;
    return {
      id: r.id,
      kind: "facture_retard",
      clientName: r.project.client.name,
      number: r.number ?? "",
      amountTtcCents: r.totalTtcCents,
      days: r.dueAt ? elapsedDays(r.dueAt, now) : 0,
      href: `/factures/${r.id}`,
      atMs,
      unread: atMs > readAtMs,
    };
  });

  const staleRows: Row[] = stale.map((r) => {
    const ref = r.emittedAt ?? r.issuedAt;
    const refMs = ref ? ref.getTime() : 0;
    const atMs = refMs + QUOTE_STALE_DAYS * DAY_MS; // passe « à relancer » au seuil
    return {
      id: r.id,
      kind: "devis_relance",
      clientName: r.project.client.name,
      number: r.number ?? "",
      amountTtcCents: r.totalTtcCents,
      days: ref ? elapsedDays(ref, now) : 0,
      href: `/devis/${r.id}`,
      atMs,
      unread: atMs > readAtMs,
    };
  });

  const rows = [...overdueRows, ...staleRows].sort((a, b) => b.atMs - a.atMs);
  const unreadCount = rows.reduce((n, r) => n + (r.unread ? 1 : 0), 0);

  // On ne renvoie pas `atMs` au client (payload minimal) : le tri et « non lu »
  // sont déjà résolus côté serveur.
  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    clientName: r.clientName,
    number: r.number,
    amountTtcCents: r.amountTtcCents,
    days: r.days,
    href: r.href,
    unread: r.unread,
  }));

  return { items, unreadCount };
}

// « Tout marquer comme lu » : mémorise l'instant présent. Les items dont
// l'horodatage d'entrée est antérieur deviennent « lus ». Appelée depuis la
// cloche (server action → cookie modifiable hors rendu).
export async function markNotificationsRead(): Promise<void> {
  await requireUserId();
  cookies().set(READ_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 an
  });
}
