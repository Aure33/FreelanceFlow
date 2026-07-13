"use server";

// Server action du tableau de bord (issue #47) — remplace les mocks de
// components/dashboard/mock-data.ts par les VRAIES données Prisma.
//
// SÉCURITÉ (non négociable) : requireUserId() en premier, CHAQUE requête
// Prisma filtre where: { userId } (Prisma CONTOURNE la RLS). Aucun montant ni
// nom d'un autre utilisateur ne peut apparaître. Sélections explicites (éco-
// conception), agrégations _sum/count côté base pour les simples totaux ;
// bucketing JS seulement pour les regroupements par mois/client (volume d'un
// freelance faible — même raisonnement que rapports/actions.ts).
//
// CONVENTIONS reprises telles quelles :
//  - « en_retard » est DÉRIVÉ, jamais stocké (effectiveStatus, cf. documents/
//    actions.ts) : une facture « envoye », non payée, dont l'échéance est
//    passée ;
//  - agrégats statistiques (KPI montants, graphe CA, part top clients) en HT
//    (totalHtCents), comme la page Rapports #11 ;
//  - montants par document (panneau « À traiter », factures récentes) en TTC
//    (totalTtcCents), comme les listes /factures /devis ;
//  - bornes de mois/trimestre en UTC (comme abonnement/rapports).
//
// NOMBRE DE REQUÊTES (important) : cette page est la plus gourmande de l'app.
// Le layout charge déjà getUsage() + getNavCounts() ; tout part en parallèle
// sur le pool Prisma. Avec le pooler Supabase, un `connection_limit` trop bas
// sérialise ces requêtes et fait dépasser le `pool_timeout` (erreur « Timed out
// fetching a new connection from the connection pool »). On garde donc le
// nombre d'allers-retours au minimum : les deux CA du KPI 1 se dérivent des
// seaux du graphe, et `overdueCount` réutilise le `_count` de l'agrégat KPI 3
// (mêmes clauses `where`). Ne pas rajouter de requête sans nécessité.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import type { OnboardingCounts } from "@/lib/onboarding";

// --- Types exposés à l'UI ----------------------------------------------------

export type DashboardPriorityItem = {
  kind: "facture_retard" | "devis_relance";
  clientName: string;
  number: string;
  amountTtcCents: number; // TTC (montant par document)
  days: number; // retard (now - dueAt) ou ancienneté d'émission (now - emittedAt)
};

export type DashboardRecentInvoice = {
  id: string;
  number: string;
  clientName: string;
  dueAt: Date | null;
  status: "envoye" | "paye" | "en_retard"; // statut EFFECTIF (en_retard dérivé)
  amountTtcCents: number; // TTC
};

export type DashboardData = {
  todayLabel: string; // date du jour FR, 1ʳᵉ lettre en majuscule, calculée SERVEUR
  kpis: {
    caEncaisseCents: number; // HT, factures payées, paidAt dans le mois en cours
    caEncaisseDeltaPct: number | null; // vs mois précédent complet ; null si 0
    enAttenteCents: number; // HT, factures « envoye » non échues
    enAttenteCount: number;
    enRetardCents: number; // HT, factures « envoye » échues non payées
    enRetardCount: number;
    devisARelancerCount: number; // devis « envoye »
    devisPotentielCents: number; // HT, Σ devis « envoye »
  };
  monthlyRevenue: { month: string; paidCents: number; pendingCents: number }[]; // 8 mois glissants
  priority: {
    overdueCount: number; // nb TOTAL de factures en retard (badge d'en-tête)
    items: DashboardPriorityItem[]; // max 5, factures en retard puis devis à relancer
  };
  recentInvoices: DashboardRecentInvoice[]; // 5 dernières factures émises
  topClients: {
    items: { clientName: string; pct: number }[]; // top 4, part en % du CA du trimestre
    othersPct: number; // part cumulée des autres (0 si <= 4 clients)
  } | null; // null si aucun CA ce trimestre
};

// Libellés courts FR des mois, index 0 = janvier (cohérent avec getUTCMonth()).
const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
] as const;

// --- Helpers -----------------------------------------------------------------

// Jours entiers écoulés entre deux dates (from antérieure à to).
function elapsedDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

// Statut effectif : la SEULE dérivation « en retard » (jamais stockée). Copie
// EXACTE de effectiveStatus() de documents/actions.ts (non exportée là-bas).
function effectiveStatus(
  row: { type: string; status: string; dueAt: Date | null; paidAt: Date | null },
  now: Date,
): "envoye" | "paye" | "en_retard" | string {
  if (
    row.type === "facture" &&
    row.status === "envoye" &&
    row.paidAt === null &&
    row.dueAt !== null &&
    row.dueAt.getTime() < now.getTime()
  ) {
    return "en_retard";
  }
  return row.status;
}

// --- Lecture -----------------------------------------------------------------

export async function getDashboardData(): Promise<DashboardData> {
  const userId = await requireUserId();

  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth();

  // Borne haute du mois calendaire en cours (UTC), qui est aussi la borne haute
  // de la fenêtre du graphe. Le CA encaissé du mois en cours et celui du mois
  // précédent ne font PAS l'objet de requêtes dédiées : ils se DÉRIVENT des deux
  // derniers seaux du graphe (même filtre exactement : facture « paye », paidAt
  // dans le mois). Voir la note sur le nombre de requêtes en tête de fichier.
  const monthEnd = new Date(Date.UTC(curY, curM + 1, 1));

  // Fenêtre de 8 mois glissants finissant au mois en cours (le plus ancien au
  // plus récent). monthsMeta[i] = année + mois de chaque colonne du graphe.
  const monthsMeta = Array.from({ length: 8 }, (_, k) => {
    const dt = new Date(Date.UTC(curY, curM + (k - 7), 1));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() };
  });
  const windowStart = new Date(Date.UTC(monthsMeta[0].y, monthsMeta[0].m, 1));
  const windowEnd = monthEnd;

  // Bornes du trimestre calendaire en cours (UTC).
  const quarterStartMonth = Math.floor(curM / 3) * 3;
  const quarterStart = new Date(Date.UTC(curY, quarterStartMonth, 1));
  const quarterEnd = new Date(Date.UTC(curY, quarterStartMonth + 3, 1));

  const [
    enAttente,
    enRetard,
    devisEnvoye,
    monthlyRows,
    overdueRows,
    devisRows,
    recentRows,
    quarterRows,
  ] = await Promise.all([
    // KPI 2 : factures en attente (HT) — « envoye » non échues.
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        paidAt: null,
        OR: [{ dueAt: null }, { dueAt: { gte: now } }],
      },
      _sum: { totalHtCents: true },
      _count: true,
    }),
    // KPI 3 : factures en retard (HT) — « envoye » échues non payées.
    // Son `_count` sert AUSSI de `overdueCount` au panneau priorité (même
    // clause where) : pas de requête `count` séparée.
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        paidAt: null,
        dueAt: { lt: now },
      },
      _sum: { totalHtCents: true },
      _count: true,
    }),
    // KPI 4 : devis à relancer (« envoye ») — compte + potentiel (HT).
    prisma.document.aggregate({
      where: { userId, type: "devis", status: "envoye" },
      _sum: { totalHtCents: true },
      _count: true,
    }),
    // Graphe CA : factures payées (paidAt) ou envoyées (issuedAt) dans la
    // fenêtre de 8 mois. Bucket par mois en JS.
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        OR: [
          { status: "paye", paidAt: { gte: windowStart, lt: windowEnd } },
          { status: "envoye", issuedAt: { gte: windowStart, lt: windowEnd } },
        ],
      },
      select: {
        status: true,
        paidAt: true,
        issuedAt: true,
        totalHtCents: true,
      },
    }),
    // Panneau priorité — factures en retard, la plus en retard en tête
    // (échéance la plus ancienne). Max 5 (les devis ne complètent qu'en deçà).
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        paidAt: null,
        dueAt: { lt: now },
      },
      select: {
        number: true,
        dueAt: true,
        totalTtcCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
    // Panneau priorité — devis à relancer (« envoye »). Tri final par
    // ancienneté d'émission (emittedAt, repli issuedAt) fait en JS.
    prisma.document.findMany({
      where: { userId, type: "devis", status: "envoye" },
      select: {
        number: true,
        emittedAt: true,
        issuedAt: true,
        totalTtcCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
      take: 5,
    }),
    // Factures récentes : 5 dernières ÉMISES (number != null), par emittedAt
    // desc (repli issuedAt).
    prisma.document.findMany({
      where: { userId, type: "facture", number: { not: null } },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        dueAt: true,
        paidAt: true,
        totalTtcCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
      orderBy: [
        { emittedAt: { sort: "desc", nulls: "last" } },
        { issuedAt: { sort: "desc", nulls: "last" } },
      ],
      take: 5,
    }),
    // Top clients (trimestre) : documents ÉMIS (hors brouillon, devis +
    // factures), issuedAt dans le trimestre. HT, groupés par client en JS.
    prisma.document.findMany({
      where: {
        userId,
        status: { not: "brouillon" },
        issuedAt: { gte: quarterStart, lt: quarterEnd },
      },
      select: {
        totalHtCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
    }),
  ]);

  // --- todayLabel ------------------------------------------------------------
  const rawLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const todayLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  // --- Graphe CA (8 mois glissants) ------------------------------------------
  // Calculé AVANT les KPI : les deux derniers seaux fournissent le CA encaissé
  // du mois en cours et du mois précédent (cf. note plus haut).
  const buckets = Array.from({ length: 8 }, () => ({
    paidCents: 0,
    pendingCents: 0,
  }));
  const bucketIndex = (dt: Date): number =>
    (dt.getUTCFullYear() - monthsMeta[0].y) * 12 +
    (dt.getUTCMonth() - monthsMeta[0].m);
  for (const row of monthlyRows) {
    if (row.status === "paye" && row.paidAt) {
      const i = bucketIndex(row.paidAt);
      if (i >= 0 && i < 8) buckets[i].paidCents += row.totalHtCents;
    } else if (row.status === "envoye" && row.issuedAt) {
      const i = bucketIndex(row.issuedAt);
      if (i >= 0 && i < 8) buckets[i].pendingCents += row.totalHtCents;
    }
  }
  const monthlyRevenue = buckets.map((b, i) => ({
    month: MONTH_LABELS[monthsMeta[i].m],
    paidCents: b.paidCents,
    pendingCents: b.pendingCents,
  }));

  // --- KPI 1 : CA encaissé + delta vs mois dernier ----------------------------
  // Dérivés des seaux : buckets[7] = mois en cours, buckets[6] = mois précédent
  // (monthsMeta[k] vaut curM + (k - 7)). Le filtre du graphe (« paye » + paidAt
  // dans la fenêtre) est exactement celui qu'auraient eu deux agrégats dédiés —
  // on économise 2 allers-retours BDD sans changer le résultat.
  const caEncaisseCents = buckets[7].paidCents;
  const caPrevMonth = buckets[6].paidCents;
  const caEncaisseDeltaPct =
    caPrevMonth === 0
      ? null
      : Math.round(((caEncaisseCents - caPrevMonth) / caPrevMonth) * 100);

  // --- Panneau priorité ------------------------------------------------------
  const overdueItems: DashboardPriorityItem[] = overdueRows.map((r) => ({
    kind: "facture_retard" as const,
    clientName: r.project.client.name,
    number: r.number ?? "",
    amountTtcCents: r.totalTtcCents,
    // dueAt est garanti non nul par le filtre (dueAt < now).
    days: r.dueAt ? elapsedDays(r.dueAt, now) : 0,
  }));

  const relanceItems: DashboardPriorityItem[] = devisRows
    .map((r) => {
      const ref = r.emittedAt ?? r.issuedAt;
      return {
        kind: "devis_relance" as const,
        clientName: r.project.client.name,
        number: r.number ?? "",
        amountTtcCents: r.totalTtcCents,
        days: ref ? elapsedDays(ref, now) : 0,
      };
    })
    // Plus anciens en tête (ancienneté d'émission la plus grande).
    .sort((a, b) => b.days - a.days);

  const priorityItems = [...overdueItems, ...relanceItems].slice(0, 5);

  // --- Factures récentes -----------------------------------------------------
  const recentInvoices: DashboardRecentInvoice[] = recentRows.map((d) => ({
    id: d.id,
    number: d.number ?? "",
    clientName: d.project.client.name,
    dueAt: d.dueAt,
    status: effectiveStatus(d, now) as "envoye" | "paye" | "en_retard",
    amountTtcCents: d.totalTtcCents,
  }));

  // --- Top clients (trimestre) -----------------------------------------------
  const totalsByClient = new Map<string, number>();
  let quarterTotal = 0;
  for (const doc of quarterRows) {
    const name = doc.project.client.name;
    totalsByClient.set(name, (totalsByClient.get(name) ?? 0) + doc.totalHtCents);
    quarterTotal += doc.totalHtCents;
  }

  let topClients: DashboardData["topClients"] = null;
  if (quarterTotal > 0) {
    const sorted = Array.from(totalsByClient.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const items = sorted.slice(0, 4).map(([clientName, cents]) => ({
      clientName,
      pct: Math.round((cents / quarterTotal) * 100),
    }));
    const othersCents = sorted
      .slice(4)
      .reduce((sum, [, cents]) => sum + cents, 0);
    const othersPct = Math.round((othersCents / quarterTotal) * 100);
    topClients = { items, othersPct };
  }

  return {
    todayLabel,
    kpis: {
      caEncaisseCents,
      caEncaisseDeltaPct,
      enAttenteCents: enAttente._sum.totalHtCents ?? 0,
      enAttenteCount: enAttente._count,
      enRetardCents: enRetard._sum.totalHtCents ?? 0,
      enRetardCount: enRetard._count,
      devisARelancerCount: devisEnvoye._count,
      devisPotentielCents: devisEnvoye._sum.totalHtCents ?? 0,
    },
    monthlyRevenue,
    priority: {
      // Même clause where que l'agrégat KPI 3 : on réutilise son _count.
      overdueCount: enRetard._count,
      items: priorityItems,
    },
    recentInvoices,
    topClients,
  };
}

// --- Premier lancement (issue #60) --------------------------------------------

// Cookie posé quand l'utilisateur ignore le guide « Premiers pas » : lu par la
// page dashboard AVANT toute requête d'onboarding, il évite aussi le re-calcul
// à chaque visite. Per-appareil (pas de colonne en base) : compromis assumé,
// l'écran disparaît de toute façon partout dès le premier document.
const ONBOARDING_DISMISSED_COOKIE = "ff-onboarding-dismissed";

export async function isOnboardingDismissed(): Promise<boolean> {
  return cookies().get(ONBOARDING_DISMISSED_COOKIE)?.value === "1";
}

// Compteurs nécessaires au calcul des étapes (computeOnboarding, lib/onboarding).
// 3 requêtes légères en parallèle ; findUnique sur id = userId (l'id EST la
// clé d'isolation), counts filtrés userId comme partout.
export async function getOnboardingStatus(): Promise<OnboardingCounts> {
  const userId = await requireUserId();

  const [user, clientCount, documentCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { siret: true },
    }),
    prisma.client.count({ where: { userId } }),
    prisma.document.count({ where: { userId } }),
  ]);

  return {
    hasSiret: Boolean(user?.siret && user.siret.trim().length > 0),
    clientCount,
    documentCount,
  };
}

// « Ignorer ce guide » : pose le cookie (1 an) puis revalide le dashboard —
// l'utilisateur retrouve le tableau de bord classique (états vides propres #47).
export async function dismissOnboarding(): Promise<void> {
  await requireUserId();

  cookies().set(ONBOARDING_DISMISSED_COOKIE, "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/dashboard");
}
