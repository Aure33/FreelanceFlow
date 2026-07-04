// Formatage d'un SIRET pour l'affichage : "84251963700014" -> "842 519 637 00014"
// (SIREN 3-3-3 + NIC 5). Toute autre longueur est renvoyée telle quelle.
export function formatSiret(siret: string): string {
  const digits = siret.replace(/\s+/g, "");
  if (!/^\d{14}$/.test(digits)) return siret;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
}
