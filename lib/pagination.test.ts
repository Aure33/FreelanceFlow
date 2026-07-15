import { describe, test, expect } from "bun:test";
import { totalPages, parsePage, paginate, PAGE_SIZE } from "./pagination";

describe("totalPages", () => {
  test("arrondit au supérieur, minimum 1", () => {
    expect(totalPages(0, 10)).toBe(1); // liste vide = 1 page vide
    expect(totalPages(1, 10)).toBe(1);
    expect(totalPages(10, 10)).toBe(1);
    expect(totalPages(11, 10)).toBe(2);
    expect(totalPages(25, 10)).toBe(3);
  });
  test("pageSize invalide → 1 page", () => {
    expect(totalPages(100, 0)).toBe(1);
  });
});

describe("parsePage", () => {
  test("valeurs valides dans les bornes", () => {
    expect(parsePage("1", 5)).toBe(1);
    expect(parsePage("3", 5)).toBe(3);
    expect(parsePage("5", 5)).toBe(5);
  });
  test("hors bornes → ramené dans [1, max]", () => {
    expect(parsePage("0", 5)).toBe(1);
    expect(parsePage("-4", 5)).toBe(1);
    expect(parsePage("99", 5)).toBe(5); // clamp au max
  });
  test("entrées non numériques / vides → 1", () => {
    expect(parsePage(undefined, 5)).toBe(1);
    expect(parsePage("", 5)).toBe(1);
    expect(parsePage("abc", 5)).toBe(1);
    expect(parsePage("2.7", 5)).toBe(2); // parseInt tronque
  });
  test("tableau (searchParams répété) → premier élément", () => {
    expect(parsePage(["3", "9"], 5)).toBe(3);
  });
  test("max au moins 1 même si maxPages = 0", () => {
    expect(parsePage("1", 0)).toBe(1);
  });
});

describe("paginate", () => {
  test("skip = (page-1)*pageSize", () => {
    const p = paginate("2", 25, 10);
    expect(p.page).toBe(2);
    expect(p.skip).toBe(10);
    expect(p.totalPages).toBe(3);
    expect(p.total).toBe(25);
    expect(p.pageSize).toBe(10);
  });
  test("page demandée au-delà du total → dernière page", () => {
    const p = paginate("42", 25, 10);
    expect(p.page).toBe(3);
    expect(p.skip).toBe(20);
  });
  test("total 0 → page 1, skip 0", () => {
    const p = paginate(undefined, 0, 10);
    expect(p.page).toBe(1);
    expect(p.skip).toBe(0);
    expect(p.totalPages).toBe(1);
  });
});

describe("PAGE_SIZE", () => {
  test("tailles attendues", () => {
    expect(PAGE_SIZE.clients).toBe(10);
    expect(PAGE_SIZE.documents).toBe(10);
    expect(PAGE_SIZE.projects).toBe(12);
  });
});
