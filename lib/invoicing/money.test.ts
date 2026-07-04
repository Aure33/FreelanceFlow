import { describe, test, expect } from "bun:test";
import {
  lineHtCents,
  lineTvaCents,
  computeTotals,
  formatEuros,
} from "./money";

// Normalise les espaces (Intl fr-FR insère U+202F / U+00A0) pour comparer.
const norm = (s: string) => s.replace(/\s/g, " ");

describe("lineHtCents — HT d'une ligne en centimes entiers", () => {
  test("quantité entière", () => {
    expect(lineHtCents(1, 1000)).toBe(1000); // 1 × 10,00 € = 10,00 €
    expect(lineHtCents(6, 32000)).toBe(192000); // 6 × 320,00 € = 1 920,00 €
  });

  test("quantité fractionnaire (2 décimales)", () => {
    expect(lineHtCents(1.5, 1000)).toBe(1500); // 1,5 × 10 € = 15 €
    expect(lineHtCents(2.5, 1999)).toBe(4998); // 2,5 × 19,99 € = 49,975 -> 49,98 €
  });
});

describe("lineTvaCents — TVA d'une ligne, arrondie au centime", () => {
  test("taux standards", () => {
    expect(lineTvaCents(100000, 20)).toBe(20000); // 1000 € × 20 % = 200 €
    expect(lineTvaCents(100000, 10)).toBe(10000);
    expect(lineTvaCents(100000, 5.5)).toBe(5500);
    expect(lineTvaCents(100000, 0)).toBe(0); // franchise
  });

  test("arrondi commercial au centime supérieur", () => {
    // 3,33 € × 20 % = 0,666 € -> 0,67 €
    expect(lineTvaCents(333, 20)).toBe(67);
    // 1,99 € × 5,5 % = 0,10945 € -> 0,11 €
    expect(lineTvaCents(199, 5.5)).toBe(11);
  });
});

describe("computeTotals — le piège des flottants", () => {
  test("0,10 € + 0,20 € font exactement 0,30 € (pas 0.30000000000000004)", () => {
    // Démonstration : en flottant, 0.1 + 0.2 !== 0.3
    expect(0.1 + 0.2).not.toBe(0.3);
    // En centimes entiers, aucune dérive.
    const totals = computeTotals([
      { quantity: 1, unitPriceCents: 10, tvaRate: 0 },
      { quantity: 1, unitPriceCents: 20, tvaRate: 0 },
    ]);
    expect(totals.totalHtCents).toBe(30);
    expect(totals.totalTtcCents).toBe(30);
    expect(norm(formatEuros(totals.totalHtCents))).toBe("0,30 €");
  });

  test("facture mono-ligne (cas maquette FAC-2026-032)", () => {
    const totals = computeTotals([
      { quantity: 1, unitPriceCents: 95000, tvaRate: 20 },
    ]);
    expect(totals).toEqual({
      totalHtCents: 95000,
      totalTvaCents: 19000,
      totalTtcCents: 114000,
    });
  });

  test("multi-taux 20 / 10 / 5,5 / 0 % (TVA par ligne)", () => {
    const totals = computeTotals([
      { quantity: 1, unitPriceCents: 10000, tvaRate: 20 }, // HT 100,00 -> TVA 20,00
      { quantity: 2, unitPriceCents: 5000, tvaRate: 10 }, // HT 100,00 -> TVA 10,00
      { quantity: 1, unitPriceCents: 20000, tvaRate: 5.5 }, // HT 200,00 -> TVA 11,00
      { quantity: 3, unitPriceCents: 10000, tvaRate: 0 }, // HT 300,00 -> TVA 0
    ]);
    expect(totals.totalHtCents).toBe(70000); // 700,00 €
    expect(totals.totalTvaCents).toBe(4100); // 20,00 + 10,00 + 11,00 + 0 = 41,00 €
    expect(totals.totalTtcCents).toBe(74100); // 741,00 €
  });

  test("TVA par ligne : somme des arrondis ≠ arrondi de la somme", () => {
    // 3 lignes à 3,33 € × 20 % : par ligne 0,67 chacune -> 2,01 € ;
    // sur le total (9,99 € × 20 % = 1,998 -> 2,00 €) donnerait 2,00 €.
    // On valide bien le mode « par ligne ».
    const totals = computeTotals([
      { quantity: 1, unitPriceCents: 333, tvaRate: 20 },
      { quantity: 1, unitPriceCents: 333, tvaRate: 20 },
      { quantity: 1, unitPriceCents: 333, tvaRate: 20 },
    ]);
    expect(totals.totalHtCents).toBe(999);
    expect(totals.totalTvaCents).toBe(201); // 3 × 67 (pas 200)
    expect(totals.totalTtcCents).toBe(1200);
  });

  test("document vide", () => {
    expect(computeTotals([])).toEqual({
      totalHtCents: 0,
      totalTvaCents: 0,
      totalTtcCents: 0,
    });
  });
});

describe("formatEuros — formatage français", () => {
  test("milliers et décimales", () => {
    expect(norm(formatEuros(123456))).toBe("1 234,56 €");
    expect(norm(formatEuros(0))).toBe("0,00 €");
    expect(norm(formatEuros(100))).toBe("1,00 €");
    expect(norm(formatEuros(114000))).toBe("1 140,00 €");
  });
});
