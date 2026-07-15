// Tests unitaires de lib/periods.ts (#65) — bornes de dates, fuseaux (tout en
// UTC), année glissante. Logique PURE : chaque fenêtre est vérifiée contre des
// timestamps UTC EXACTS (Date.UTC), pas des à-peu-près — une erreur d'un jour
// ou d'un fuseau ferait échouer ces tests.
//
// Convention testée partout : intervalles semi-ouverts [start, end) — la borne
// `end`/`prevEnd` est EXCLUSIVE (c'est le 1er instant HORS période).

import { test, expect, describe } from "bun:test";
import {
  parseDashboardPeriod,
  parseReportsPeriod,
  dashboardWindow,
  reportsWindow,
  monthsBetween,
  monthIndex,
  reportsLabels,
  DASHBOARD_COMPARISON_LABEL,
  DASHBOARD_RANGE_LABEL,
  type MonthRef,
} from "@/lib/periods";

// Raccourci : Date UTC exacte (m = 0..11 comme getUTCMonth).
const utc = (y: number, m: number, d = 1, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, d, h, min));

// --- Parsing (whitelist stricte) -----------------------------------------------

describe("parseDashboardPeriod", () => {
  test("valeurs valides acceptées telles quelles", () => {
    expect(parseDashboardPeriod("mois")).toBe("mois");
    expect(parseDashboardPeriod("trimestre")).toBe("trimestre");
    expect(parseDashboardPeriod("annee")).toBe("annee");
  });

  test("valeurs invalides → défaut « mois » (jamais d'erreur)", () => {
    expect(parseDashboardPeriod("pwned")).toBe("mois");
    expect(parseDashboardPeriod(undefined)).toBe("mois");
    expect(parseDashboardPeriod("")).toBe("mois");
    // « 12mois » appartient à la whitelist RAPPORTS, pas dashboard.
    expect(parseDashboardPeriod("12mois")).toBe("mois");
    expect(parseDashboardPeriod("ANNEE")).toBe("mois"); // sensible à la casse
  });
});

describe("parseReportsPeriod", () => {
  test("valeurs valides acceptées telles quelles", () => {
    expect(parseReportsPeriod("annee")).toBe("annee");
    expect(parseReportsPeriod("12mois")).toBe("12mois");
    expect(parseReportsPeriod("trimestre")).toBe("trimestre");
  });

  test("valeurs invalides → défaut « annee »", () => {
    expect(parseReportsPeriod("pwned")).toBe("annee");
    expect(parseReportsPeriod(undefined)).toBe("annee");
    expect(parseReportsPeriod("")).toBe("annee");
    // « mois » appartient à la whitelist DASHBOARD, pas rapports.
    expect(parseReportsPeriod("mois")).toBe("annee");
  });
});

// --- dashboardWindow ------------------------------------------------------------

describe("dashboardWindow", () => {
  test("mois : mois calendaire courant, prev = mois précédent complet", () => {
    // Peu importe l'heure/le jour dans le mois : bornes = 1ers de mois 00:00 UTC.
    const win = dashboardWindow("mois", utc(2026, 6, 14, 15, 30)); // 14 juil.
    expect(win.start.getTime()).toBe(Date.UTC(2026, 6, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2026, 7, 1)); // 1er août, EXCLU
    expect(win.prevStart.getTime()).toBe(Date.UTC(2026, 5, 1));
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 6, 1));
    // Périodes contiguës : prevEnd (exclusif) = start (inclusif).
    expect(win.prevEnd.getTime()).toBe(win.start.getTime());
  });

  test("mois en janvier : prev = décembre de l'année PRÉCÉDENTE", () => {
    const win = dashboardWindow("mois", utc(2026, 0, 5));
    expect(win.start.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2026, 1, 1));
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 11, 1)); // 1er déc. 2025
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 0, 1));
  });

  test("trimestre T1 (janvier) : prev = T4 de l'année précédente", () => {
    const win = dashboardWindow("trimestre", utc(2026, 0, 20));
    expect(win.start.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2026, 3, 1)); // 1er avril, EXCLU
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 9, 1)); // 1er oct. 2025
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 0, 1));
  });

  test("trimestre en juillet : T3, prev = T2 (même année)", () => {
    const win = dashboardWindow("trimestre", utc(2026, 6, 14, 15, 30));
    expect(win.start.getTime()).toBe(Date.UTC(2026, 6, 1)); // 1er juillet
    expect(win.end.getTime()).toBe(Date.UTC(2026, 9, 1)); // 1er octobre, EXCLU
    expect(win.prevStart.getTime()).toBe(Date.UTC(2026, 3, 1)); // 1er avril
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 6, 1));
  });

  test("trimestre : les 3 mois d'un même trimestre donnent la MÊME fenêtre", () => {
    const a = dashboardWindow("trimestre", utc(2026, 6, 1));
    const b = dashboardWindow("trimestre", utc(2026, 8, 30, 23, 59));
    expect(a.start.getTime()).toBe(b.start.getTime());
    expect(a.end.getTime()).toBe(b.end.getTime());
    expect(a.prevStart.getTime()).toBe(b.prevStart.getTime());
  });

  test("annee : année calendaire, prev = année précédente COMPLÈTE", () => {
    const win = dashboardWindow("annee", utc(2026, 6, 14));
    expect(win.start.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2027, 0, 1)); // EXCLU
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 0, 1));
    // Dashboard : année précédente COMPLÈTE (pas « à date » — contrairement
    // au mode « annee » des rapports).
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 0, 1));
  });
});

// --- reportsWindow ---------------------------------------------------------------

describe("reportsWindow", () => {
  test("annee : 12 mois calendaires (Jan..Déc), prev À DATE (lendemain du même jour N-1, 00:00 UTC, journée incluse)", () => {
    const win = reportsWindow("annee", utc(2026, 6, 14, 15, 30)); // 14/07 15:30
    expect(win.start.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2027, 0, 1));
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 0, 1));
    // « À date » : le 14/07/2025 est INCLUS → borne exclusive = 15/07 00:00 UTC.
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2025, 6, 15));

    expect(win.months).toHaveLength(12);
    expect(win.months[0]).toEqual({ y: 2026, m: 0 });
    expect(win.months[11]).toEqual({ y: 2026, m: 11 });
  });

  test("annee au 1er janvier : prevEnd = 2 janvier N-1 (la journée du 1er est comparée)", () => {
    const win = reportsWindow("annee", utc(2026, 0, 1, 0, 5));
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 0, 1));
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2025, 0, 2));
  });

  test("annee un 29 février (bissextile) : Date.UTC normalise le « 30 février » N-1 en 2 mars", () => {
    // COMPORTEMENT DOCUMENTÉ : le 29/02/2024 n'a pas d'équivalent en 2023.
    // prevEnd = Date.UTC(2023, 1, 29 + 1) = « 30 février 2023 », que Date.UTC
    // normalise en 2 MARS 2023 (février 2023 = 28 jours). La comparaison « à
    // date » déborde donc d'un jour (le 1er mars 2023 est inclus) — assumé :
    // pas d'exception, ordre des bornes préservé (prevStart < prevEnd).
    const win = reportsWindow("annee", utc(2024, 1, 29, 10, 0));
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2023, 2, 2)); // 2 mars 2023
    expect(win.prevStart.getTime()).toBe(Date.UTC(2023, 0, 1));
    expect(win.prevStart.getTime()).toBeLessThan(win.prevEnd.getTime());
  });

  test("12mois : 12 mois glissants finissant au mois courant, prev = les 12 d'avant (année glissante)", () => {
    const win = reportsWindow("12mois", utc(2026, 6, 14)); // juillet 2026
    expect(win.start.getTime()).toBe(Date.UTC(2025, 7, 1)); // 1er août 2025
    expect(win.end.getTime()).toBe(Date.UTC(2026, 7, 1)); // 1er août 2026, EXCLU
    expect(win.prevStart.getTime()).toBe(Date.UTC(2024, 7, 1)); // 1er août 2024
    expect(win.prevEnd.getTime()).toBe(win.start.getTime()); // contiguës

    // 12 seaux, à CHEVAL sur 2 années : août..déc 2025 puis jan..juil 2026.
    expect(win.months).toHaveLength(12);
    expect(win.months[0]).toEqual({ y: 2025, m: 7 });
    expect(win.months[4]).toEqual({ y: 2025, m: 11 }); // déc. 2025
    expect(win.months[5]).toEqual({ y: 2026, m: 0 }); // jan. 2026
    expect(win.months[11]).toEqual({ y: 2026, m: 6 }); // juil. 2026 (mois courant)
  });

  test("trimestre en janvier : T1, prev = T4 N-1, 3 seaux mensuels", () => {
    const win = reportsWindow("trimestre", utc(2026, 0, 9));
    expect(win.start.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.end.getTime()).toBe(Date.UTC(2026, 3, 1));
    expect(win.prevStart.getTime()).toBe(Date.UTC(2025, 9, 1)); // T4 2025
    expect(win.prevEnd.getTime()).toBe(Date.UTC(2026, 0, 1));
    expect(win.months).toEqual([
      { y: 2026, m: 0 },
      { y: 2026, m: 1 },
      { y: 2026, m: 2 },
    ]);
  });
});

// --- monthsBetween ---------------------------------------------------------------

describe("monthsBetween", () => {
  test("fenêtre intra-année : [mars, juin) → mars, avril, mai", () => {
    expect(monthsBetween(utc(2026, 2), utc(2026, 5))).toEqual([
      { y: 2026, m: 2 },
      { y: 2026, m: 3 },
      { y: 2026, m: 4 },
    ]);
  });

  test("fenêtre à cheval sur 2 années : [nov 2025, fév 2026) → nov, déc, jan", () => {
    expect(monthsBetween(utc(2025, 10), utc(2026, 1))).toEqual([
      { y: 2025, m: 10 },
      { y: 2025, m: 11 },
      { y: 2026, m: 0 },
    ]);
  });

  test("vide si start >= end", () => {
    expect(monthsBetween(utc(2026, 5), utc(2026, 5))).toEqual([]);
    expect(monthsBetween(utc(2026, 6), utc(2026, 5))).toEqual([]);
  });

  test("la borne end est EXCLUSIVE (le mois de end n'apparaît pas)", () => {
    const months = monthsBetween(utc(2026, 0), utc(2027, 0));
    expect(months).toHaveLength(12);
    expect(months[11]).toEqual({ y: 2026, m: 11 });
    // Aucun mois de 2027.
    expect(months.some((mm) => mm.y === 2027)).toBe(false);
  });
});

// --- monthIndex --------------------------------------------------------------------

describe("monthIndex", () => {
  const year2026: MonthRef[] = monthsBetween(utc(2026, 0), utc(2027, 0));

  test("date dans la fenêtre → index du seau", () => {
    expect(monthIndex(year2026, utc(2026, 0, 1))).toBe(0);
    expect(monthIndex(year2026, utc(2026, 6, 14, 15, 30))).toBe(6);
    expect(monthIndex(year2026, utc(2026, 11, 31, 23, 59))).toBe(11);
  });

  test("date AVANT la fenêtre → index négatif (jamais crédité à un seau)", () => {
    expect(monthIndex(year2026, utc(2025, 11, 15))).toBe(-1);
    expect(monthIndex(year2026, utc(2025, 0, 1))).toBe(-12);
  });

  test("date APRÈS la fenêtre → index >= length", () => {
    expect(monthIndex(year2026, utc(2027, 0, 1))).toBe(12);
    expect(monthIndex(year2026, utc(2027, 1, 3))).toBeGreaterThanOrEqual(
      year2026.length,
    );
  });

  test("fenêtre à cheval sur 2 années : indexation continue", () => {
    const win = monthsBetween(utc(2025, 7), utc(2026, 7)); // août 2025..juil 2026
    expect(monthIndex(win, utc(2025, 7, 2))).toBe(0);
    expect(monthIndex(win, utc(2025, 11, 25))).toBe(4);
    expect(monthIndex(win, utc(2026, 0, 3))).toBe(5);
    expect(monthIndex(win, utc(2026, 6, 30))).toBe(11);
  });

  test("liste vide → -1", () => {
    expect(monthIndex([], utc(2026, 5, 10))).toBe(-1);
  });
});

// --- Libellés -----------------------------------------------------------------------

describe("libellés", () => {
  test("dashboard : libellés de comparaison et de plage par période", () => {
    expect(DASHBOARD_COMPARISON_LABEL.mois).toBe("vs mois dernier");
    expect(DASHBOARD_COMPARISON_LABEL.trimestre).toBe("vs trimestre dernier");
    expect(DASHBOARD_COMPARISON_LABEL.annee).toBe("vs année dernière");
    expect(DASHBOARD_RANGE_LABEL.mois).toBe("ce mois-ci");
    expect(DASHBOARD_RANGE_LABEL.trimestre).toBe("ce trimestre");
    expect(DASHBOARD_RANGE_LABEL.annee).toBe("cette année");
  });

  test("reportsLabels('annee', juillet 2026) : année 2026, vs 2025 à date", () => {
    const labels = reportsLabels("annee", utc(2026, 6, 14));
    expect(labels.subtitle).toBe("année 2026");
    expect(labels.caTitle).toBe("CA encaissé en 2026");
    expect(labels.caComparison).toBe("vs 2025 à date");
    expect(labels.delayComparison).toBe("vs 2025");
    expect(labels.quotesFoot).toBe("en 2026");
  });

  test("reportsLabels('trimestre', juillet 2026) : T3 2026", () => {
    const labels = reportsLabels("trimestre", utc(2026, 6, 14));
    expect(labels.subtitle).toBe("trimestre en cours (T3 2026)");
    expect(labels.caTitle).toBe("CA encaissé au T3 2026");
    expect(labels.caComparison).toBe("vs trimestre précédent");
  });

  test("reportsLabels('trimestre') : trimestre correct aux bords (janvier=T1, décembre=T4)", () => {
    expect(reportsLabels("trimestre", utc(2026, 0, 1)).subtitle).toBe(
      "trimestre en cours (T1 2026)",
    );
    expect(reportsLabels("trimestre", utc(2026, 11, 31)).subtitle).toBe(
      "trimestre en cours (T4 2026)",
    );
  });

  test("reportsLabels('12mois') : libellés glissants (aucune année affichée)", () => {
    const labels = reportsLabels("12mois", utc(2026, 6, 14));
    expect(labels.subtitle).toBe("12 derniers mois");
    expect(labels.caTitle).toBe("CA encaissé sur 12 mois");
    expect(labels.caComparison).toBe("vs 12 mois précédents");
  });
});
