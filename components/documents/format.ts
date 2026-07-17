// Formatage d'affichage des documents (dates, quantités, taux). Les montants,
// eux, passent toujours par formatEuros de lib/invoicing (centimes entiers).
//
// Les dates des documents sont stockées à minuit UTC (cf. lib/invoicing/dates) :
// on formate en timeZone UTC pour éviter tout décalage de jour selon le fuseau.

const listDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

// Liste Devis / Factures : « 4 juin », « 18 mars ».
export function formatListDate(date: Date | null): string {
  return date ? listDateFormatter.format(date) : "—";
}

// Document A4 : « 02/06/2026 » (parts UTC).
export function formatDocDate(date: Date | null): string {
  if (!date) return "—";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// Horodatage complet (date + heure) — UTC comme le reste du fichier, pour un
// événement instantané réel (ex. envoi e-mail, #83) plutôt qu'une date métier.
export function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDocDate(date)} à ${hh}:${mi}`;
}

// Quantité décimale → notation française (« 1,5 »).
export function formatQty(quantity: number): string {
  return String(quantity).replace(".", ",");
}

// Taux de TVA → « 20 % » / « 5,5 % ».
export function formatRate(rate: number): string {
  return `${String(rate).replace(".", ",")} %`;
}
