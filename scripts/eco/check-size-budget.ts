// Garde-fou éco-conception (issue #62) : budget de JavaScript PAR ROUTE, joué
// en CI juste après `next build` (job build). Le poids du JS embarqué est le
// levier n° 1 du poids de page (les 3 métriques EcoIndex en dépendent) : ce
// script fait échouer la CI si une route dépasse son budget — un import lourd
// côté client (lib de graphe, moment.js…) se voit AVANT le merge, pas après.
//
// Méthode : `.next/app-build-manifest.json` liste, pour chaque route App
// Router, TOUS les fichiers JS nécessaires au premier chargement (chunks
// partagés inclus). On somme leur taille GZIPPÉE (~ ce qui transite réellement
// sur le réseau) et on compare au budget de `size-budget.json`
// (`defaultKb` + dérogations par route documentées).
//
// Usage : bun scripts/eco/check-size-budget.ts   (exit 1 si dépassement)

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

export type SizeBudget = {
  defaultKb: number;
  routes: Record<string, number>;
};

export type RouteReport = {
  route: string;
  sizeKb: number;
  budgetKb: number;
  over: boolean;
};

// « /(app)/dashboard/page » → « /dashboard » (groupes de routes retirés).
export function cleanRoute(manifestKey: string): string {
  const withoutPage = manifestKey.replace(/\/page$/, "");
  const withoutGroups = withoutPage.replace(/\/\([^)]+\)/g, "");
  return withoutGroups === "" ? "/" : withoutGroups;
}

// Cœur pur (testé unitairement) : applique le budget aux tailles mesurées.
export function checkSizeBudget(
  manifestPages: Record<string, string[]>,
  gzippedKbByFile: Map<string, number>,
  budget: SizeBudget,
): RouteReport[] {
  const reports: RouteReport[] = [];

  for (const [key, files] of Object.entries(manifestPages)) {
    if (!key.endsWith("/page")) continue; // layouts/templates : comptés via les pages
    const route = cleanRoute(key);
    const jsFiles = Array.from(new Set(files.filter((f) => f.endsWith(".js"))));
    const sizeKb = jsFiles.reduce(
      (sum, f) => sum + (gzippedKbByFile.get(f) ?? 0),
      0,
    );
    const budgetKb = budget.routes[route] ?? budget.defaultKb;
    reports.push({
      route,
      sizeKb: Number(sizeKb.toFixed(1)),
      budgetKb,
      over: sizeKb > budgetKb,
    });
  }

  return reports.sort((a, b) => b.sizeKb - a.sizeKb);
}

function main() {
  const root = process.cwd();
  const manifest = JSON.parse(
    readFileSync(path.join(root, ".next/app-build-manifest.json"), "utf8"),
  ) as { pages: Record<string, string[]> };
  const budget = JSON.parse(
    readFileSync(path.join(root, "scripts/eco/size-budget.json"), "utf8"),
  ) as SizeBudget;

  // Taille gzip de chaque fichier JS référencé (mesurée une seule fois).
  const gzippedKbByFile = new Map<string, number>();
  for (const files of Object.values(manifest.pages)) {
    for (const f of files) {
      if (!f.endsWith(".js") || gzippedKbByFile.has(f)) continue;
      const raw = readFileSync(path.join(root, ".next", f));
      gzippedKbByFile.set(f, gzipSync(raw).length / 1024);
    }
  }

  const reports = checkSizeBudget(manifest.pages, gzippedKbByFile, budget);
  const overs = reports.filter((r) => r.over);

  console.log("Budget JS par route (gzip, premier chargement) :");
  for (const r of reports) {
    console.log(
      `${r.over ? "✗ DÉPASSEMENT" : "✓"} ${r.route.padEnd(28)} ${r.sizeKb} Ko / budget ${r.budgetKb} Ko`,
    );
  }

  if (overs.length > 0) {
    console.error(
      `\n${overs.length} route(s) au-dessus du budget. Alléger le JS client ` +
        "(import dynamique, retrait de dépendance) ou, si le surcoût est " +
        "justifié, documenter une dérogation dans scripts/eco/size-budget.json.",
    );
    process.exit(1);
  }
  console.log("\nBudget respecté sur toutes les routes.");
}

// Exécution directe uniquement (le module reste importable par les tests).
// Garde stricte `endsWith` : sous `bun test`, argv[1] = chemin du FICHIER DE
// TEST (`…/check-size-budget.test.ts`), qu'un simple `includes` matcherait —
// main() lirait alors .next/ et ferait exit 1 pendant la suite unitaire.
if (process.argv[1]?.endsWith("check-size-budget.ts")) {
  main();
}
