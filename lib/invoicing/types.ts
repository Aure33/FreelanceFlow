// Types partagés du domaine facturation.
// Volontairement SANS dépendance serveur : ce module est importé aussi bien par
// l'aperçu live (client) que par les server actions (calcul autoritatif).

// Nature du document.
export type DocType = "devis" | "facture";

// Régime de TVA de l'émetteur (choisi dans Paramètres). Impacte les mentions
// légales auto-injectées et, en franchise, force la TVA à 0.
export type TvaRegime = "franchise" | "reel" | "normal";

// Conditions de paiement proposées par l'éditeur (cf. maquette « Nouvelle
// facture »). Déterminent le calcul de l'échéance.
export type PaymentTerm = "reception" | "net30" | "net45em" | "net60";

// Taux de TVA autorisés (en pourcentage). 0 = franchise / exonération.
export const ALLOWED_TVA_RATES = [0, 5.5, 10, 20] as const;
export type TvaRate = (typeof ALLOWED_TVA_RATES)[number];

// Ligne de prestation minimale nécessaire au calcul (montants en CENTIMES).
export type LineForTotals = {
  quantity: number; // quantité (peut être fractionnaire, 2 décimales max)
  unitPriceCents: number; // prix unitaire HT en centimes entiers
  tvaRate: number; // taux de TVA de la ligne, en pourcentage
};

// Totaux d'un document, exclusivement en centimes entiers.
export type DocumentTotals = {
  totalHtCents: number;
  totalTvaCents: number;
  totalTtcCents: number;
};
