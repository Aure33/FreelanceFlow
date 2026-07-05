"use server";

// Server action de la page Rapports (issue #11).
//
// SÉCURITÉ (non négociable) : requireUserId() en premier, CHAQUE requête
// Prisma filtre where: { userId }. Les 2 blocs Premium (répartition CA par
// client, délais de paiement par client) ne sont NI calculés NI renvoyés pour
// un compte "free" — le check planType est fait AVANT de lancer ces requêtes,
// pas "calculé puis masqué côté client" (le flou CSS de la maquette n'est pas
// une barrière de sécurité réelle). Sélections Prisma explicites (éco-
// conception), agrégations en JS uniquement quand une agrégation groupée par
// relation (client) n'est pas exprimable par un groupBy Prisma — volume de
// données d'un freelance qui reste faible (même raisonnement que
// `monthlyRevenue`, cf. documents/actions.ts pour les agrégats _sum simples).
//
// Toutes les bornes d'année sont en UTC (même convention que
// documents/actions.ts : year = issued.getUTCFullYear() ; abonnement/
// actions.ts : currentMonthRangeUtc()).

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

// --- Types exposés à l'UI ----------------------------------------------------

export type ReportsData = {
  year: number; // année calendaire en cours (serveur, pas côté client)
  kpis: {
    caEncaisseCents: number;
    caEncaisseDeltaPct: number | null; // vs même période l'année précédente (year-to-date) ; null si rien à comparer l'an dernier
    enAttenteCents: number;
    enAttenteCount: number;
    delaiMoyenPaiementJours: number | null; // null si aucune facture payée cette année
    delaiMoyenPaiementDeltaJours: number | null; // vs année précédente ; null si rien à comparer
    tauxAcceptationDevisPct: number; // 0 si aucun devis décidé
    devisAcceptesCount: number;
    devisDecidesCount: number; // accepté + refusé (dénominateur du taux)
  };
  monthlyRevenue: { month: string; paidCents: number; pendingCents: number }[]; // 12 entrées Jan->Déc de l'année en cours
  premium: {
    clientRevenueBreakdown: {
      items: { clientName: string; cents: number }[];
      othersCents: number;
    } | null;
    paymentDelaysByClient: {
      items: { clientName: string; days: number }[];
      averageDays: number;
    } | null;
  };
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

// --- Helpers ------------------------------------------------------------------

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// --- Lecture -------------------------------------------------------------

// Données agrégées de la page /rapports : 4 KPI, le graphe CA mensuel (12
// mois de l'année en cours) et — uniquement pour un compte "premium" — les 2
// blocs avancés (répartition CA par client, délais de paiement par client).
// Pour un compte "free", ces 2 blocs sont `null` : ni calculés, ni renvoyés.
export async function getReportsData(): Promise<ReportsData> {
  const userId = await requireUserId();

  const now = new Date();
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const prevYearStart = new Date(Date.UTC(year - 1, 0, 1));
  const prevYearEnd = yearStart;
  // Borne "à date" de l'année précédente : même jour calendaire, l'an
  // dernier, journée incluse (borne exclusive = lendemain à 00:00 UTC).
  const prevYearToDateEnd = new Date(
    Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate() + 1),
  );

  const [
    me,
    caEncaisse,
    caEncaissePrevYearToDate,
    enAttente,
    paidThisYearRows,
    paidPrevYearRows,
    devisAcceptesCount,
    devisRefusesCount,
    monthlyRows,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true },
    }),
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: yearStart, lt: yearEnd },
      },
      _sum: { totalHtCents: true },
    }),
    prisma.document.aggregate({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: prevYearStart, lt: prevYearToDateEnd },
      },
      _sum: { totalHtCents: true },
    }),
    prisma.document.aggregate({
      where: { userId, type: "facture", status: "envoye" },
      _sum: { totalHtCents: true },
      _count: true,
    }),
    // Factures payées cette année (délai de paiement + blocs premium par
    // client) : select explicite, on remonte le client via project pour
    // pouvoir réutiliser ces mêmes lignes pour le bloc premium (pas de
    // second aller-retour BDD).
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        issuedAt: true,
        paidAt: true,
        project: { select: { client: { select: { name: true } } } },
      },
    }),
    // Même délai, année précédente COMPLÈTE (pour le delta du KPI) — pas
    // besoin du client ici.
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        status: "paye",
        paidAt: { gte: prevYearStart, lt: prevYearEnd },
      },
      select: { issuedAt: true, paidAt: true },
    }),
    prisma.document.count({
      where: {
        userId,
        type: "devis",
        status: "accepte",
        issuedAt: { gte: yearStart, lt: yearEnd },
      },
    }),
    prisma.document.count({
      where: {
        userId,
        type: "devis",
        status: "refuse",
        issuedAt: { gte: yearStart, lt: yearEnd },
      },
    }),
    // Graphe mensuel : une seule requête pour l'année, bucket par mois en JS
    // (volume d'un freelance faible — cf. note en tête de fichier).
    prisma.document.findMany({
      where: {
        userId,
        type: "facture",
        OR: [
          { status: "paye", paidAt: { gte: yearStart, lt: yearEnd } },
          { status: "envoye", issuedAt: { gte: yearStart, lt: yearEnd } },
        ],
      },
      select: {
        status: true,
        paidAt: true,
        issuedAt: true,
        totalHtCents: true,
      },
    }),
  ]);

  const planType = me?.planType === "premium" ? "premium" : "free";

  // --- KPI 1 : CA encaissé + delta vs même période l'an dernier -------------
  const caEncaisseCents = caEncaisse._sum.totalHtCents ?? 0;
  const caPrevYtd = caEncaissePrevYearToDate._sum.totalHtCents ?? 0;
  const caEncaisseDeltaPct =
    caPrevYtd === 0
      ? null
      : Math.round(((caEncaisseCents - caPrevYtd) / caPrevYtd) * 100);

  // --- KPI 2 : en attente ----------------------------------------------------
  const enAttenteCents = enAttente._sum.totalHtCents ?? 0;
  const enAttenteCount = enAttente._count;

  // --- KPI 3 : délai moyen de paiement + delta vs année précédente ----------
  const thisYearDelays = paidThisYearRows
    .filter((r): r is typeof r & { issuedAt: Date; paidAt: Date } =>
      Boolean(r.issuedAt && r.paidAt),
    )
    .map((r) => daysBetween(r.issuedAt, r.paidAt));
  const prevYearDelays = paidPrevYearRows
    .filter((r): r is typeof r & { issuedAt: Date; paidAt: Date } =>
      Boolean(r.issuedAt && r.paidAt),
    )
    .map((r) => daysBetween(r.issuedAt, r.paidAt));

  const thisYearAvgDelay = average(thisYearDelays);
  const prevYearAvgDelay = average(prevYearDelays);

  const delaiMoyenPaiementJours =
    thisYearAvgDelay === null ? null : Math.round(thisYearAvgDelay);
  const delaiMoyenPaiementDeltaJours =
    thisYearAvgDelay === null || prevYearAvgDelay === null
      ? null
      : Math.round(thisYearAvgDelay) - Math.round(prevYearAvgDelay);

  // --- KPI 4 : taux d'acceptation des devis -----------------------------------
  const devisDecidesCount = devisAcceptesCount + devisRefusesCount;
  const tauxAcceptationDevisPct =
    devisDecidesCount === 0
      ? 0
      : Math.round((devisAcceptesCount / devisDecidesCount) * 100);

  // --- Graphe CA mensuel -------------------------------------------------------
  const buckets = Array.from({ length: 12 }, () => ({
    paidCents: 0,
    pendingCents: 0,
  }));
  for (const row of monthlyRows) {
    if (row.status === "paye" && row.paidAt) {
      buckets[row.paidAt.getUTCMonth()].paidCents += row.totalHtCents;
    } else if (row.status === "envoye" && row.issuedAt) {
      buckets[row.issuedAt.getUTCMonth()].pendingCents += row.totalHtCents;
    }
  }
  const monthlyRevenue = buckets.map((b, i) => ({
    month: MONTH_LABELS[i],
    paidCents: b.paidCents,
    pendingCents: b.pendingCents,
  }));

  // --- Blocs Premium -----------------------------------------------------------
  // Check du plan AVANT tout calcul : pour un compte "free" on ne lance même
  // pas les requêtes/agrégations de ces 2 blocs.
  let clientRevenueBreakdown: ReportsData["premium"]["clientRevenueBreakdown"] =
    null;
  let paymentDelaysByClient: ReportsData["premium"]["paymentDelaysByClient"] =
    null;

  if (planType === "premium") {
    // Répartition du CA par client : tous les documents ÉMIS (devis +
    // factures, hors brouillon) de l'année en cours, groupés par client.
    const emittedDocs = await prisma.document.findMany({
      where: {
        userId,
        status: { not: "brouillon" },
        issuedAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        totalHtCents: true,
        project: { select: { client: { select: { name: true } } } },
      },
    });

    const totalsByClient = new Map<string, number>();
    for (const doc of emittedDocs) {
      const name = doc.project.client.name;
      totalsByClient.set(
        name,
        (totalsByClient.get(name) ?? 0) + doc.totalHtCents,
      );
    }
    const sortedClients = Array.from(totalsByClient.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const topClients = sortedClients
      .slice(0, 4)
      .map(([clientName, cents]) => ({ clientName, cents }));
    const othersCents = sortedClients
      .slice(4)
      .reduce((sum, [, cents]) => sum + cents, 0);

    clientRevenueBreakdown = { items: topClients, othersCents };

    // Délais de paiement par client : réutilise les lignes déjà chargées
    // pour le KPI (factures "paye", paidAt dans l'année en cours).
    const delaysByClient = new Map<string, number[]>();
    for (const row of paidThisYearRows) {
      if (!row.issuedAt || !row.paidAt) continue;
      const name = row.project.client.name;
      const days = daysBetween(row.issuedAt, row.paidAt);
      const list = delaysByClient.get(name) ?? [];
      list.push(days);
      delaysByClient.set(name, list);
    }
    const perClientAverages = Array.from(delaysByClient.entries())
      .map(([clientName, days]) => ({
        clientName,
        days: Math.round(average(days) ?? 0),
      }))
      .sort((a, b) => a.days - b.days);

    paymentDelaysByClient = {
      items: perClientAverages.slice(0, 4),
      // Moyenne globale tous clients confondus — identique à
      // delaiMoyenPaiementJours (même jeu de données), réutilisée telle
      // quelle plutôt que recalculée.
      averageDays: delaiMoyenPaiementJours ?? 0,
    };
  }

  return {
    year,
    kpis: {
      caEncaisseCents,
      caEncaisseDeltaPct,
      enAttenteCents,
      enAttenteCount,
      delaiMoyenPaiementJours,
      delaiMoyenPaiementDeltaJours,
      tauxAcceptationDevisPct,
      devisAcceptesCount,
      devisDecidesCount,
    },
    monthlyRevenue,
    premium: {
      clientRevenueBreakdown,
      paymentDelaysByClient,
    },
  };
}
