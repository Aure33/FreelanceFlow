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

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

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

  // Bornes du mois calendaire en cours et du précédent (UTC).
  const monthStart = new Date(Date.UTC(curY, curM, 1));
  const monthEnd = new Date(Date.UTC(curY, curM + 1, 1));
  const prevMonthStart = new Date(Date.UTC(curY, curM - 1, 1));
  const prevMonthEnd = monthStart;

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
    caEncaisse,
    caEncaissePrevMonth,
    enAttente,
    enRetard,
    devisEnvoye,
    monthlyRows,
    overdueCount,
    overdueRows,
    devisRows,
    recentRows,
    quarterRows,
  ] = await Promise.all([
    // KPI 1 : CA encaissé (HT) ce mois-ci.
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { totalHtCents: true },
    }),
    // KPI 1 (delta) : CA encaissé (HT) le mois précédent complet.
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: prevMonthStart, lt: prevMonthEnd },
      },
      _sum: { totalHtCents: true },
    }),
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
    // Panneau priorité — badge : nb TOTAL de factures en retard.
    prisma.document.count({
      where: {
        userId,
        type: "facture",
        status: "envoye",
        paidAt: null,
        dueAt: { lt: now },
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

  // --- KPI --------------------------------------------------------------------
  const caEncaisseCents = caEncaisse._sum.totalHtCents ?? 0;
  const caPrevMonth = caEncaissePrevMonth._sum.totalHtCents ?? 0;
  const caEncaisseDeltaPct =
    caPrevMonth === 0
      ? null
      : Math.round(((caEncaisseCents - caPrevMonth) / caPrevMonth) * 100);

  // --- Graphe CA (8 mois glissants) ------------------------------------------
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
      overdueCount,
      items: priorityItems,
    },
    recentInvoices,
    topClients,
  };
}
