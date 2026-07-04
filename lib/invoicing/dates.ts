// Calcul de la date d'échéance selon les conditions de paiement de l'éditeur.
//
// Calendaire uniquement : on raisonne en dates UTC (getters/setters UTC) pour
// éviter tout décalage lié au fuseau ou à l'heure d'été. « en retard » n'est
// JAMAIS stocké : il se déduit de dueAt vs. maintenant (voir statuts).

import type { PaymentTerm } from "./types";

// Libellés d'affichage (cf. maquette « Nouvelle facture »).
export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  reception: "À réception",
  net30: "30 jours",
  net45em: "45 jours fin de mois",
  net60: "60 jours",
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Dernier jour du mois de `base` (en UTC), heure inchangée.
function endOfMonth(base: Date): Date {
  const d = new Date(base.getTime());
  // Jour 0 du mois suivant = dernier jour du mois courant.
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d;
}

// Échéance à partir de la date d'émission et des conditions de paiement.
//  - reception : le jour même ;
//  - net30 / net60 : émission + 30 / 60 jours ;
//  - net45em : émission + 45 jours, puis fin de ce mois.
export function computeDueDate(issuedAt: Date, term: PaymentTerm): Date {
  switch (term) {
    case "reception":
      return new Date(issuedAt.getTime());
    case "net30":
      return addDays(issuedAt, 30);
    case "net60":
      return addDays(issuedAt, 60);
    case "net45em":
      return endOfMonth(addDays(issuedAt, 45));
  }
}
