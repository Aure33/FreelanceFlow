// Tests unitaires du port EcoIndex (issue #62). Les valeurs attendues sont
// CALCULÉES À LA MAIN depuis la formule officielle (cnumr/GreenIT-Analysis) :
//   q(v)      = i-1 + (v - Q[i-1]) / (Q[i] - Q[i-1])  où i = 1er index tel que v < Q[i]
//               (v au-delà du dernier quantile → q = 20)
//   score     = 100 - 5 * (3*qDom + 2*qReq + qSize) / 6
//   grade     = A si score > 80, B si > 70, C si > 55, D si > 40,
//               E si > 25, F si > 10, sinon G          (frontières STRICTES)
//   GES (g)   = 2 + 2*(50 - score)/100     (arrondi 2 décimales)
//   Eau (cl)  = 3 + 3*(50 - score)/100     (arrondi 2 décimales)
// Aucune I/O : logique pure uniquement. (tsconfig target es5 : pas de spread
// d'itérables exotiques ni de for..of sur Set/Map dans ce fichier.)
import { test, expect } from "bun:test";

import {
  QUANTILES_DOM,
  QUANTILES_REQ,
  QUANTILES_SIZE_KB,
  computeQuantile,
  computeEcoIndexScore,
  ecoIndexGrade,
  greenhouseGasesGrams,
  waterCentiliters,
} from "./ecoindex";

// ---------------------------------------------------------------------------
// Tableaux de quantiles : garde anti-régression sur la grille officielle.
// ---------------------------------------------------------------------------

test("les 3 grilles de quantiles ont 21 valeurs strictement croissantes", () => {
  const grids = [QUANTILES_DOM, QUANTILES_REQ, QUANTILES_SIZE_KB];
  for (let g = 0; g < grids.length; g++) {
    const q = grids[g];
    expect(q.length).toBe(21);
    expect(q[0]).toBe(0);
    for (let i = 1; i < q.length; i++) {
      expect(q[i]).toBeGreaterThan(q[i - 1]);
    }
  }
});

// ---------------------------------------------------------------------------
// computeQuantile
// ---------------------------------------------------------------------------

test("computeQuantile: valeur 0 → position 0", () => {
  // 0 < Q[1]=47 → q = 0 + (0-0)/(47-0) = 0
  expect(computeQuantile(QUANTILES_DOM, 0)).toBe(0);
});

test("computeQuantile: valeur PILE sur un quantile → index entier du quantile", () => {
  // v=47 : 47 < 47 est faux, 47 < 75 est vrai → q = 1 + (47-47)/(75-47) = 1
  expect(computeQuantile(QUANTILES_DOM, 47)).toBe(1);
  // v=15 (requêtes) : 15 < 15 faux, 15 < 25 vrai → q = 2 + 0/10 = 2
  expect(computeQuantile(QUANTILES_REQ, 15)).toBe(2);
  // v=144.7 (poids) : 144.7 < 144.7 faux, < 319.53 vrai → q = 2
  expect(computeQuantile(QUANTILES_SIZE_KB, 144.7)).toBe(2);
});

test("computeQuantile: interpolation entre deux quantiles, vérifiée pas à pas", () => {
  // v=61 (DOM), entre Q[1]=47 et Q[2]=75 :
  //   q = 1 + (61-47)/(75-47) = 1 + 14/28 = 1.5
  expect(computeQuantile(QUANTILES_DOM, 61)).toBeCloseTo(1.5, 10);
  // v=20 (requêtes), entre Q[2]=15 et Q[3]=25 :
  //   q = 2 + (20-15)/(25-15) = 2 + 5/10 = 2.5
  expect(computeQuantile(QUANTILES_REQ, 20)).toBeCloseTo(2.5, 10);
});

test("computeQuantile: au-delà du dernier quantile → 20", () => {
  // v=594601 : jamais < Q[i] (dernier = 594601, strict) → longueur-1 = 20
  expect(computeQuantile(QUANTILES_DOM, 594601)).toBe(20);
  expect(computeQuantile(QUANTILES_DOM, 10_000_000)).toBe(20);
  expect(computeQuantile(QUANTILES_REQ, 5000)).toBe(20);
  expect(computeQuantile(QUANTILES_SIZE_KB, 500_000)).toBe(20);
});

// ---------------------------------------------------------------------------
// computeEcoIndexScore — valeurs de référence calculées à la main
// ---------------------------------------------------------------------------

test("score: page vide (0 DOM, 0 requête, 0 Ko) → 100, grade A", () => {
  // qDom = qReq = qSize = 0 → score = 100 - 5*0/6 = 100
  const score = computeEcoIndexScore(0, 0, 0);
  expect(score).toBe(100);
  expect(ecoIndexGrade(score)).toBe("A");
});

test("score: DOM pile sur le quantile 1 (47 éléments) → 97.5", () => {
  // qDom = 1, qReq = 0, qSize = 0
  // score = 100 - 5*(3*1 + 0 + 0)/6 = 100 - 15/6 = 100 - 2.5 = 97.5
  expect(computeEcoIndexScore(47, 0, 0)).toBe(97.5);
});

test("score: DOM interpolé (61 → q=1.5) → 96.25", () => {
  // score = 100 - 5*(3*1.5)/6 = 100 - 22.5/6 = 100 - 3.75 = 96.25
  expect(computeEcoIndexScore(61, 0, 0)).toBe(96.25);
});

test("score: triplet complet interpolé (100 DOM, 10 req, 100 Ko)", () => {
  // qDom  = 2 + (100-75)/(159-75)      = 2 + 25/84     ≈ 2.2976190476
  // qReq  = 1 + (10-2)/(15-2)          = 1 + 8/13      ≈ 1.6153846154
  // qSize = 1 + (100-1.37)/(144.7-1.37)= 1 + 98.63/143.33 ≈ 1.6881323798
  // score = 100 - 5*(3*2.2976190 + 2*1.6153846 + 1.6881324)/6
  //       = 100 - 5*(6.8928571 + 3.2307692 + 1.6881324)/6
  //       = 100 - 5*11.8117588/6 ≈ 100 - 9.8431323 ≈ 90.1568677
  expect(computeEcoIndexScore(100, 10, 100)).toBeCloseTo(90.1568677, 6);
});

test("score: tout au-delà du dernier quantile → q=20 partout → score 0, grade G", () => {
  // score = 100 - 5*(3*20 + 2*20 + 20)/6 = 100 - 5*120/6 = 100 - 100 = 0
  const score = computeEcoIndexScore(1_000_000, 10_000, 1_000_000);
  expect(score).toBe(0);
  expect(ecoIndexGrade(score)).toBe("G");
});

// ---------------------------------------------------------------------------
// ecoIndexGrade — frontières STRICTES (`>`, pas `>=`)
// ---------------------------------------------------------------------------

test("grade: frontières exactes A..G (strictes)", () => {
  expect(ecoIndexGrade(100)).toBe("A");
  expect(ecoIndexGrade(80.01)).toBe("A");
  expect(ecoIndexGrade(80)).toBe("B"); // 80 n'est PAS > 80
  expect(ecoIndexGrade(70.01)).toBe("B");
  expect(ecoIndexGrade(70)).toBe("C"); // objectif cahier des charges : > 70
  expect(ecoIndexGrade(55.01)).toBe("C");
  expect(ecoIndexGrade(55)).toBe("D");
  expect(ecoIndexGrade(40.01)).toBe("D");
  expect(ecoIndexGrade(40)).toBe("E");
  expect(ecoIndexGrade(25.01)).toBe("E");
  expect(ecoIndexGrade(25)).toBe("F");
  expect(ecoIndexGrade(10.01)).toBe("F");
  expect(ecoIndexGrade(10)).toBe("G");
  expect(ecoIndexGrade(0)).toBe("G");
});

// ---------------------------------------------------------------------------
// Monotonie : plus de DOM/requêtes/poids ⇒ le score ne remonte JAMAIS
// ---------------------------------------------------------------------------

test("monotonie: triplets strictement croissants → scores décroissants (au sens large)", () => {
  const triplets: Array<[number, number, number]> = [
    [0, 0, 0],
    [50, 5, 50],
    [200, 20, 300],
    [600, 60, 1200],
    [1500, 150, 4000],
    [3000, 400, 10000],
    [700000, 5000, 300000],
  ];
  let previous = Infinity;
  for (let i = 0; i < triplets.length; i++) {
    const t = triplets[i];
    const score = computeEcoIndexScore(t[0], t[1], t[2]);
    expect(score).toBeLessThanOrEqual(previous);
    previous = score;
  }
});

test("monotonie: chaque métrique isolée fait baisser le score", () => {
  const base = computeEcoIndexScore(100, 10, 100);
  expect(computeEcoIndexScore(200, 10, 100)).toBeLessThan(base);
  expect(computeEcoIndexScore(100, 20, 100)).toBeLessThan(base);
  expect(computeEcoIndexScore(100, 10, 200)).toBeLessThan(base);
});

// ---------------------------------------------------------------------------
// Équivalents environnementaux (formules officielles)
// ---------------------------------------------------------------------------

test("GES/eau: score 50 → 2.0 g CO2e / 3.0 cl (point de référence officiel)", () => {
  // GES = 2 + 2*(50-50)/100 = 2 ; eau = 3 + 3*(50-50)/100 = 3
  expect(greenhouseGasesGrams(50)).toBe(2);
  expect(waterCentiliters(50)).toBe(3);
});

test("GES/eau: score 100 → 1.0 g / 1.5 cl ; score 0 → 3.0 g / 4.5 cl", () => {
  // score 100 : GES = 2 + 2*(-50)/100 = 1 ; eau = 3 + 3*(-50)/100 = 1.5
  expect(greenhouseGasesGrams(100)).toBe(1);
  expect(waterCentiliters(100)).toBe(1.5);
  // score 0 : GES = 2 + 2*50/100 = 3 ; eau = 3 + 3*50/100 = 4.5
  expect(greenhouseGasesGrams(0)).toBe(3);
  expect(waterCentiliters(0)).toBe(4.5);
});

test("GES/eau: arrondi à 2 décimales", () => {
  // score 33.333 : GES = 2 + 2*(16.667)/100 = 2.33334 → 2.33
  //                eau = 3 + 3*(16.667)/100 = 3.50001 → 3.5
  expect(greenhouseGasesGrams(33.333)).toBe(2.33);
  expect(waterCentiliters(33.333)).toBe(3.5);
});
