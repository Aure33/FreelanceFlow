import { describe, expect, test } from "bun:test";
import {
  currentMonthLabel,
  memberSinceLabel,
  nextMonthFirstLabel,
  parisCurrentYear,
  parisTodayInputValue,
  shortDateLabel,
} from "./date-fr";

// #113 : les libellés sont calculés à Paris, quel que soit le fuseau de la
// machine (serveur UTC, navigateur local) — sinon erreur d'hydratation.

describe("parisTodayInputValue", () => {
  test("23 h UTC en été = lendemain à Paris", () => {
    expect(parisTodayInputValue(new Date("2026-09-12T22:30:00Z"))).toBe("2026-09-13");
  });
  test("juste avant minuit à Paris = même jour", () => {
    expect(parisTodayInputValue(new Date("2026-09-12T21:59:00Z"))).toBe("2026-09-12");
  });
  test("hiver (UTC+1)", () => {
    expect(parisTodayInputValue(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02-01");
  });
});

describe("parisCurrentYear", () => {
  test("réveillon : l'année bascule à Paris avant UTC", () => {
    expect(parisCurrentYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(parisCurrentYear(new Date("2026-12-31T22:59:00Z"))).toBe(2026);
  });
});

describe("libellés de mois", () => {
  test("mois courant à Paris", () => {
    expect(currentMonthLabel(new Date("2026-08-31T22:30:00Z"))).toBe("septembre");
  });
  test("1ᵉʳ du mois suivant, y compris en fin d'année", () => {
    expect(nextMonthFirstLabel(new Date("2026-09-13T10:00:00Z"))).toBe("1ᵉʳ octobre");
    expect(nextMonthFirstLabel(new Date("2026-12-31T23:30:00Z"))).toBe("1ᵉʳ février");
    expect(nextMonthFirstLabel(new Date("2026-12-15T10:00:00Z"))).toBe("1ᵉʳ janvier");
  });
  test("ancienneté du compte", () => {
    expect(memberSinceLabel(new Date("2026-06-30T22:30:00Z"))).toBe("juillet 2026");
  });
});

describe("shortDateLabel", () => {
  test("projet créé à 0 h 30 heure de Paris", () => {
    expect(shortDateLabel(new Date("2026-07-03T22:30:00Z"))).toBe("4 juil. 2026");
  });
});
