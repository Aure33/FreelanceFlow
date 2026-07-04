import { describe, test, expect } from "bun:test";
import { nextNumber, documentPrefix } from "./numbering";

describe("nextNumber — séquence par type et par année", () => {
  test("aucun document existant -> 001", () => {
    expect(nextNumber("facture", 2026, [])).toBe("FAC-2026-001");
    expect(nextNumber("devis", 2026, [])).toBe("DEV-2026-001");
  });

  test("suit le max existant (+1)", () => {
    expect(
      nextNumber("facture", 2026, ["FAC-2026-001", "FAC-2026-002"]),
    ).toBe("FAC-2026-003");
  });

  test("ne dépend pas de l'ordre de la liste", () => {
    expect(
      nextNumber("facture", 2026, ["FAC-2026-003", "FAC-2026-001", "FAC-2026-002"]),
    ).toBe("FAC-2026-004");
  });

  test("suit le max même en présence d'un trou (pas de réutilisation)", () => {
    // 003 manquant : on ne le réutilise pas, on continue à 005.
    expect(
      nextNumber("facture", 2026, ["FAC-2026-001", "FAC-2026-002", "FAC-2026-004"]),
    ).toBe("FAC-2026-005");
  });

  test("séquences DEV et FAC totalement indépendantes", () => {
    const existing = ["FAC-2026-005", "DEV-2026-001", "DEV-2026-002"];
    expect(nextNumber("facture", 2026, existing)).toBe("FAC-2026-006");
    expect(nextNumber("devis", 2026, existing)).toBe("DEV-2026-003");
  });

  test("séquences séparées par année", () => {
    const existing = ["FAC-2025-009", "FAC-2025-010"];
    expect(nextNumber("facture", 2026, existing)).toBe("FAC-2026-001");
    expect(nextNumber("facture", 2025, existing)).toBe("FAC-2025-011");
  });

  test("ignore numéros mal formés, null/undefined et autres préfixes", () => {
    const existing = [
      null,
      undefined,
      "",
      "FAC-2026-XYZ",
      "DEV-2026-050",
      "FAC-2026-007",
      "AVOIR-2026-999",
    ];
    expect(nextNumber("facture", 2026, existing)).toBe("FAC-2026-008");
  });

  test("séquence au-delà de 999 conserve les chiffres", () => {
    expect(nextNumber("facture", 2026, ["FAC-2026-999"])).toBe("FAC-2026-1000");
  });

  test("documentPrefix", () => {
    expect(documentPrefix("facture")).toBe("FAC");
    expect(documentPrefix("devis")).toBe("DEV");
  });
});
