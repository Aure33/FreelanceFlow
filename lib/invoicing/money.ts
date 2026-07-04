// Cœur des calculs monétaires — TOUT en CENTIMES ENTIERS.
//
// Règle d'or du projet : jamais de flottant pour stocker ou sommer de l'argent.
// `0.1 + 0.2 !== 0.3` ; un total TTC faux d'un centime est un bug bloquant.
// Les seuls flottants tolérés sont : (1) la quantité et le taux de TVA en
// entrée (bornés à 2 et 1 décimale), aussitôt convertis en entiers ; (2) la
// division par 100 au moment du FORMATAGE (affichage uniquement).

import type { DocumentTotals, LineForTotals } from "./types";

// Arrondi commercial (demi supérieur) d'une fraction entière num/den, avec
// num ≥ 0 et den > 0. Reste dans les entiers : aucune erreur de virgule
// flottante possible sur les ordres de grandeur d'une facture.
function divRoundHalfUp(num: number, den: number): number {
  return Math.floor((num * 2 + den) / (den * 2));
}

// Montant HT d'une ligne, en centimes entiers.
// La quantité (max 2 décimales) est convertie en centièmes entiers, puis le
// produit qté×PU est ramené aux centimes avec arrondi commercial.
export function lineHtCents(quantity: number, unitPriceCents: number): number {
  const qtyHundredths = Math.round(quantity * 100); // ex. 1.5 -> 150
  const num = qtyHundredths * unitPriceCents; // en centimes × 100
  return divRoundHalfUp(num, 100);
}

// Montant de TVA d'une ligne, en centimes entiers, arrondi AU CENTIME.
// Le taux (ex. 5,5 %) est converti en dixièmes de point (55) pour rester entier.
export function lineTvaCents(htCents: number, tvaRate: number): number {
  const rateTenths = Math.round(tvaRate * 10); // 20 -> 200 ; 5.5 -> 55 ; 0 -> 0
  const num = htCents * rateTenths;
  return divRoundHalfUp(num, 1000);
}

// Totaux d'un document. Choix explicite : la TVA est arrondie PAR LIGNE (au
// centime) puis sommée — cohérent avec la « TVA par ligne » du schéma et avec
// l'affichage ligne à ligne de l'éditeur. On ne recalcule pas la TVA sur le
// total HT (ce qui pourrait diverger d'un centime).
export function computeTotals(lines: LineForTotals[]): DocumentTotals {
  let totalHtCents = 0;
  let totalTvaCents = 0;

  for (const line of lines) {
    const ht = lineHtCents(line.quantity, line.unitPriceCents);
    const tva = lineTvaCents(ht, line.tvaRate);
    totalHtCents += ht;
    totalTvaCents += tva;
  }

  return {
    totalHtCents,
    totalTvaCents,
    totalTtcCents: totalHtCents + totalTvaCents,
  };
}

// Formatage monétaire français : 123456 -> « 1 234,56 € ».
// La division par 100 n'a lieu QU'ICI (affichage). Intl gère la locale.
const eurosFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function formatEuros(cents: number): string {
  return eurosFormatter.format(cents / 100);
}
