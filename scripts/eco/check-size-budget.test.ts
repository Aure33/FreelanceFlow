// Tests unitaires du garde-fou budget JS par route (issue #62).
// Logique pure uniquement (`cleanRoute` + `checkSizeBudget`) : le manifest et
// les tailles gzip sont FABRIQUÉS ici — aucun .next/, aucune I/O.
//
// NB garde d'exécution : sous `bun test`, process.argv[1] = chemin de CE
// fichier (`…/check-size-budget.test.ts`). La garde du script est donc en
// `endsWith("check-size-budget.ts")` (strict) et non `includes(…)`, sinon
// l'import ci-dessous déclencherait main() (lecture .next/ + exit 1).
import { test, expect } from "bun:test";

import {
  cleanRoute,
  checkSizeBudget,
  type SizeBudget,
} from "./check-size-budget";

// ---------------------------------------------------------------------------
// cleanRoute
// ---------------------------------------------------------------------------

test("cleanRoute: racine — « /page » → « / »", () => {
  expect(cleanRoute("/page")).toBe("/");
});

test("cleanRoute: groupe de routes simple retiré", () => {
  expect(cleanRoute("/(app)/dashboard/page")).toBe("/dashboard");
});

test("cleanRoute: groupes multiples/imbriqués tous retirés", () => {
  expect(cleanRoute("/(public)/(marketing)/tarifs/page")).toBe("/tarifs");
});

test("cleanRoute: groupe seul à la racine → « / »", () => {
  // « /(public)/page » : sans le groupe il ne reste rien → racine.
  expect(cleanRoute("/(public)/page")).toBe("/");
});

test("cleanRoute: segment dynamique [id] conservé", () => {
  expect(cleanRoute("/(app)/factures/[id]/page")).toBe("/factures/[id]");
});

// ---------------------------------------------------------------------------
// checkSizeBudget — manifest fabriqué
// ---------------------------------------------------------------------------

// 3 routes + 1 layout (à ignorer). La route dashboard contient un doublon
// (shared.js deux fois) et un .css ; la route [id] référence un fichier
// absent de la map des tailles.
const MANIFEST: Record<string, string[]> = {
  "/(app)/dashboard/page": [
    "static/chunks/shared.js",
    "static/chunks/dashboard.js",
    "static/css/app.css",
    "static/chunks/shared.js", // doublon volontaire
  ],
  "/(public)/page": ["static/chunks/shared.js", "static/chunks/home.js"],
  "/(app)/factures/[id]/page": [
    "static/chunks/shared.js",
    "static/chunks/facture.js",
    "static/chunks/absent.js", // absent de la map → compté 0
  ],
  "/(app)/layout": ["static/chunks/layout.js"], // ne finit pas par /page → ignoré
};

function makeSizes(): Map<string, number> {
  const sizes = new Map<string, number>();
  sizes.set("static/chunks/shared.js", 50);
  sizes.set("static/chunks/dashboard.js", 30);
  sizes.set("static/chunks/home.js", 10);
  sizes.set("static/chunks/facture.js", 25.5);
  sizes.set("static/chunks/layout.js", 999); // ne doit jamais être compté
  // Piège : si le filtre `.js` était absent, le CSS gonflerait le dashboard.
  sizes.set("static/css/app.css", 999);
  return sizes;
}

const BUDGET: SizeBudget = {
  defaultKb: 100,
  routes: { "/dashboard": 80 }, // dérogation par route
};

test("checkSizeBudget: ignore les clés hors « /page » (layouts)", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  expect(reports.length).toBe(3);
  const routes = reports.map((r) => r.route);
  expect(routes).toContain("/dashboard");
  expect(routes).toContain("/");
  expect(routes).toContain("/factures/[id]");
});

test("checkSizeBudget: déduplique les fichiers et ignore les non-.js", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  const dash = reports.find((r) => r.route === "/dashboard")!;
  // shared(50) + dashboard(30) — shared compté UNE fois, css(999) exclu = 80.
  expect(dash.sizeKb).toBe(80);
});

test("checkSizeBudget: fichier absent de la map → compté 0", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  const facture = reports.find((r) => r.route === "/factures/[id]")!;
  // shared(50) + facture(25.5) + absent(0) = 75.5
  expect(facture.sizeKb).toBe(75.5);
  expect(facture.over).toBe(false);
});

test("checkSizeBudget: budget par route sinon defaultKb", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  expect(reports.find((r) => r.route === "/dashboard")!.budgetKb).toBe(80);
  expect(reports.find((r) => r.route === "/")!.budgetKb).toBe(100);
  expect(reports.find((r) => r.route === "/factures/[id]")!.budgetKb).toBe(100);
});

test("checkSizeBudget: égalité au budget = OK (over strictement >)", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  const dash = reports.find((r) => r.route === "/dashboard")!;
  expect(dash.sizeKb).toBe(dash.budgetKb); // 80 = 80, pile au budget
  expect(dash.over).toBe(false);
});

test("checkSizeBudget: dépassement détecté au premier dixième au-dessus", () => {
  const sizes = makeSizes();
  sizes.set("static/chunks/dashboard.js", 30.1); // 50 + 30.1 = 80.1 > 80
  const reports = checkSizeBudget(MANIFEST, sizes, BUDGET);
  const dash = reports.find((r) => r.route === "/dashboard")!;
  expect(dash.sizeKb).toBe(80.1);
  expect(dash.over).toBe(true);
  // Les autres routes restent sous leur budget.
  expect(reports.filter((r) => r.over).length).toBe(1);
});

test("checkSizeBudget: rapports triés par taille décroissante", () => {
  const reports = checkSizeBudget(MANIFEST, makeSizes(), BUDGET);
  // 80 (/dashboard) ≥ 75.5 (/factures/[id]) ≥ 60 (/)
  expect(reports.map((r) => r.route)).toEqual([
    "/dashboard",
    "/factures/[id]",
    "/",
  ]);
  for (let i = 1; i < reports.length; i++) {
    expect(reports[i].sizeKb).toBeLessThanOrEqual(reports[i - 1].sizeKb);
  }
});

test("checkSizeBudget: sizeKb arrondi à 1 décimale", () => {
  const sizes = makeSizes();
  sizes.set("static/chunks/home.js", 10.26); // 50 + 10.26 = 60.26 → 60.3
  const reports = checkSizeBudget(MANIFEST, sizes, BUDGET);
  expect(reports.find((r) => r.route === "/")!.sizeKb).toBe(60.3);
});

test("checkSizeBudget: manifest vide → aucun rapport", () => {
  expect(checkSizeBudget({}, new Map(), BUDGET)).toEqual([]);
});
