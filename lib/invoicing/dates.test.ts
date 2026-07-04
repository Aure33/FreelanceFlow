import { describe, test, expect } from "bun:test";
import { computeDueDate } from "./dates";

// Émission le 10/06/2026 (UTC).
const issued = new Date("2026-06-10T00:00:00.000Z");
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("computeDueDate — échéance selon conditions de paiement", () => {
  test("À réception -> le jour même", () => {
    expect(day(computeDueDate(issued, "reception"))).toBe("2026-06-10");
  });

  test("30 jours -> +30 jours calendaires", () => {
    expect(day(computeDueDate(issued, "net30"))).toBe("2026-07-10");
  });

  test("60 jours -> +60 jours calendaires", () => {
    expect(day(computeDueDate(issued, "net60"))).toBe("2026-08-09");
  });

  test("45 jours fin de mois -> +45 jours puis dernier jour du mois", () => {
    // 10/06 + 45 j = 25/07 ; fin de mois -> 31/07.
    expect(day(computeDueDate(issued, "net45em"))).toBe("2026-07-31");
  });

  test("franchissement d'année (net60 en fin d'année)", () => {
    const dec = new Date("2026-12-20T00:00:00.000Z");
    expect(day(computeDueDate(dec, "net60"))).toBe("2027-02-18");
  });

  test("net45em en février (année bissextile 2028)", () => {
    // 20/01/2028 + 45 j = 05/03/2028 ; fin de mois -> 31/03/2028.
    const jan = new Date("2028-01-20T00:00:00.000Z");
    expect(day(computeDueDate(jan, "net45em"))).toBe("2028-03-31");
  });

  test("ne mute pas la date d'entrée", () => {
    const before = issued.getTime();
    computeDueDate(issued, "net60");
    expect(issued.getTime()).toBe(before);
  });
});
