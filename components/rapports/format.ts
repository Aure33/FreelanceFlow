import { formatEuros } from "@/lib/invoicing";

// Sépare le montant et le symbole monétaire d'un formatage `formatEuros`
// (ex. "38 270,00 €" -> "38 270,00") pour reproduire le gabarit maquette
// valeur + <small>unité</small> (cf. `.kpi .val small`). Le séparateur avant
// le symbole est une espace insécable (U+00A0) produite par Intl.
export function eurosAmount(cents: number): string {
  return formatEuros(cents).replace(/ €$/, "");
}

// Formate un delta signé en pourcentage, ex. 12 -> "+12 %", -4 -> "−4 %".
// Utilise le signe moins typographique (U+2212), identique à la maquette.
export function formatPctDelta(value: number): string {
  if (value > 0) return `+${value} %`;
  if (value < 0) return `−${Math.abs(value)} %`;
  return "0 %";
}

// Formate un delta signé en jours, ex. -4 -> "−4 j", 3 -> "+3 j".
export function formatDaysDelta(value: number): string {
  if (value > 0) return `+${value} j`;
  if (value < 0) return `−${Math.abs(value)} j`;
  return "0 j";
}

// Accord singulier/pluriel simple (règle déjà utilisée dans le projet : > 1).
export function plural(count: number, suffix = "s"): string {
  return count > 1 ? suffix : "";
}
