// Bornes de périodes des segments dashboard/rapports (issue #65) — logique
// PURE (aucune dépendance), testée unitairement avec `bun test`.
//
// Convention du projet : toutes les bornes sont en UTC (comme documents/,
// abonnement/ et rapports/actions.ts), intervalles semi-ouverts [start, end).
//
// Deltas « vs période précédente équivalente » :
//  - dashboard : période calendaire COURANTE (partielle) vs période précédente
//    COMPLÈTE — même convention que le KPI historique « vs mois précédent
//    complet » (#47), étendue au trimestre et à l'année ;
//  - rapports « annee » : année en cours vs année précédente À DATE (même jour
//    calendaire, journée incluse) — convention historique de #11 ;
//  - rapports « 12mois » / « trimestre » : fenêtre vs fenêtre précédente de
//    même longueur (complète).

export type DashboardPeriod = "mois" | "trimestre" | "annee";
export type ReportsPeriod = "annee" | "12mois" | "trimestre";

export type MonthRef = { y: number; m: number }; // m = 0..11 (getUTCMonth)

export type PeriodWindow = {
  start: Date; // période courante, incluse
  end: Date; // borne EXCLUSIVE
  prevStart: Date; // période de comparaison, incluse
  prevEnd: Date; // borne EXCLUSIVE
};

// --- Parsing (whitelist stricte, jamais d'erreur : défaut) ---------------------

export function parseDashboardPeriod(raw: string | undefined): DashboardPeriod {
  return raw === "trimestre" || raw === "annee" ? raw : "mois";
}

export function parseReportsPeriod(raw: string | undefined): ReportsPeriod {
  return raw === "12mois" || raw === "trimestre" ? raw : "annee";
}

// --- Bornes -------------------------------------------------------------------

function monthStartUtc(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1));
}

export function dashboardWindow(
  period: DashboardPeriod,
  now: Date,
): PeriodWindow {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (period === "annee") {
    return {
      start: monthStartUtc(y, 0),
      end: monthStartUtc(y + 1, 0),
      prevStart: monthStartUtc(y - 1, 0),
      prevEnd: monthStartUtc(y, 0),
    };
  }
  if (period === "trimestre") {
    const qm = Math.floor(m / 3) * 3;
    return {
      start: monthStartUtc(y, qm),
      end: monthStartUtc(y, qm + 3),
      prevStart: monthStartUtc(y, qm - 3),
      prevEnd: monthStartUtc(y, qm),
    };
  }
  return {
    start: monthStartUtc(y, m),
    end: monthStartUtc(y, m + 1),
    prevStart: monthStartUtc(y, m - 1),
    prevEnd: monthStartUtc(y, m),
  };
}

export function reportsWindow(
  period: ReportsPeriod,
  now: Date,
): PeriodWindow & { months: MonthRef[] } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (period === "12mois") {
    // 12 mois glissants finissant au mois en cours (inclus).
    const start = monthStartUtc(y, m - 11);
    const end = monthStartUtc(y, m + 1);
    return {
      start,
      end,
      prevStart: monthStartUtc(y, m - 23),
      prevEnd: start,
      months: monthsBetween(start, end),
    };
  }
  if (period === "trimestre") {
    const qm = Math.floor(m / 3) * 3;
    const start = monthStartUtc(y, qm);
    return {
      start,
      end: monthStartUtc(y, qm + 3),
      prevStart: monthStartUtc(y, qm - 3),
      prevEnd: start,
      months: monthsBetween(start, monthStartUtc(y, qm + 3)),
    };
  }
  // « annee » : comparaison À DATE (même jour calendaire l'an dernier, journée
  // incluse — borne exclusive = lendemain 00:00 UTC), convention de #11.
  return {
    start: monthStartUtc(y, 0),
    end: monthStartUtc(y + 1, 0),
    prevStart: monthStartUtc(y - 1, 0),
    prevEnd: new Date(Date.UTC(y - 1, m, now.getUTCDate() + 1)),
    months: monthsBetween(monthStartUtc(y, 0), monthStartUtc(y + 1, 0)),
  };
}

// Mois calendaires couverts par [start, endExclusive) — start est supposé être
// un 1er de mois UTC (c'est le cas de toutes les fenêtres ci-dessus).
export function monthsBetween(start: Date, endExclusive: Date): MonthRef[] {
  const months: MonthRef[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (Date.UTC(y, m, 1) < endExclusive.getTime()) {
    months.push({ y, m });
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

// Index d'une date dans une liste de mois contigus (négatif / hors bornes si
// en dehors) — sert au bucketing des graphes.
export function monthIndex(months: MonthRef[], date: Date): number {
  if (months.length === 0) return -1;
  return (
    (date.getUTCFullYear() - months[0].y) * 12 +
    (date.getUTCMonth() - months[0].m)
  );
}

// --- Libellés (français, affichés tels quels par l'UI) --------------------------

export const DASHBOARD_COMPARISON_LABEL: Record<DashboardPeriod, string> = {
  mois: "vs mois dernier",
  trimestre: "vs trimestre dernier",
  annee: "vs année dernière",
};

export const DASHBOARD_RANGE_LABEL: Record<DashboardPeriod, string> = {
  mois: "ce mois-ci",
  trimestre: "ce trimestre",
  annee: "cette année",
};

export function reportsLabels(period: ReportsPeriod, now: Date) {
  const y = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  if (period === "12mois") {
    return {
      subtitle: "12 derniers mois",
      caTitle: "CA encaissé sur 12 mois",
      caComparison: "vs 12 mois précédents",
      delayComparison: "vs 12 mois précédents",
      quotesFoot: "sur les 12 derniers mois",
    };
  }
  if (period === "trimestre") {
    return {
      subtitle: `trimestre en cours (T${quarter} ${y})`,
      caTitle: `CA encaissé au T${quarter} ${y}`,
      caComparison: "vs trimestre précédent",
      delayComparison: "vs trimestre précédent",
      quotesFoot: "ce trimestre",
    };
  }
  return {
    subtitle: `année ${y}`,
    caTitle: `CA encaissé en ${y}`,
    caComparison: `vs ${y - 1} à date`,
    delayComparison: `vs ${y - 1}`,
    quotesFoot: `en ${y}`,
  };
}
