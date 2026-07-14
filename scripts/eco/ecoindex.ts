// EcoIndex — port TypeScript de la formule OFFICIELLE (issue #62).
// Source : cnumr/GreenIT-Analysis `script/ecoIndex.js` (AGPL, www.ecoindex.fr),
// quantiles et calculs repris à l'identique — ne pas « améliorer » ces valeurs,
// elles font référence. Logique pure, testée unitairement (`bun test`).
//
// Le score (0..100) se calcule à partir de 3 métriques d'une page chargée à
// froid : nombre d'éléments DOM, nombre de requêtes HTTP, poids transféré (Ko).
// Pondération officielle : DOM ×3, requêtes ×2, poids ×1. Grade A..G ;
// l'objectif du cahier des charges est ≥ B, soit un score > 70.

export const QUANTILES_DOM = [
  0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674, 753, 843, 949, 1076,
  1237, 1459, 1801, 2479, 594601,
];

export const QUANTILES_REQ = [
  0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105, 117, 130, 147, 170,
  205, 281, 3920,
];

export const QUANTILES_SIZE_KB = [
  0, 1.37, 144.7, 319.53, 479.46, 631.97, 783.38, 937.91, 1098.62, 1265.47,
  1448.32, 1648.27, 1876.08, 2142.06, 2465.37, 2866.31, 3401.59, 4155.73,
  5400.08, 8037.54, 223212.26,
];

// Position (interpolée) d'une valeur dans la grille de quantiles — 0..20.
export function computeQuantile(quantiles: number[], value: number): number {
  for (let i = 1; i < quantiles.length; i++) {
    if (value < quantiles[i]) {
      return i - 1 + (value - quantiles[i - 1]) / (quantiles[i] - quantiles[i - 1]);
    }
  }
  return quantiles.length - 1;
}

export function computeEcoIndexScore(
  domElements: number,
  requests: number,
  sizeKb: number,
): number {
  const qDom = computeQuantile(QUANTILES_DOM, domElements);
  const qReq = computeQuantile(QUANTILES_REQ, requests);
  const qSize = computeQuantile(QUANTILES_SIZE_KB, sizeKb);
  return 100 - (5 * (3 * qDom + 2 * qReq + qSize)) / 6;
}

export type EcoIndexGrade = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export function ecoIndexGrade(score: number): EcoIndexGrade {
  if (score > 80) return "A";
  if (score > 70) return "B";
  if (score > 55) return "C";
  if (score > 40) return "D";
  if (score > 25) return "E";
  if (score > 10) return "F";
  return "G";
}

// Équivalents environnementaux officiels (par page vue).
export function greenhouseGasesGrams(score: number): number {
  return Number((2 + (2 * (50 - score)) / 100).toFixed(2));
}

export function waterCentiliters(score: number): number {
  return Number((3 + (3 * (50 - score)) / 100).toFixed(2));
}
