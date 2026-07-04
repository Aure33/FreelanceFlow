// Numérotation séquentielle des documents : FAC-2026-001 / DEV-2026-001.
//
// Séquences SÉPARÉES par type (FAC vs DEV) et par année. La fonction est pure :
// elle calcule le prochain numéro à partir des numéros DÉJÀ émis. L'unicité
// réelle (absence de collision) est garantie côté base par la contrainte
// unique (user_id, number) + une transaction à l'émission (cf. actions.ts).

import type { DocType } from "./types";

const PREFIX: Record<DocType, string> = {
  facture: "FAC",
  devis: "DEV",
};

export function documentPrefix(type: DocType): string {
  return PREFIX[type];
}

// Prochain numéro pour un type/une année donnés : max(existants) + 1, sur 3
// chiffres minimum. Ne réutilise jamais un « trou » — on suit toujours le max,
// ce qui, combiné à l'attribution atomique à l'émission, évite trous ET
// collisions. Les numéros ne correspondant pas au préfixe/année sont ignorés.
export function nextNumber(
  type: DocType,
  year: number,
  existingNumbers: readonly (string | null | undefined)[],
): string {
  const prefix = PREFIX[type];
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);

  let max = 0;
  for (const n of existingNumbers) {
    if (!n) continue;
    const m = re.exec(n);
    if (m) {
      const value = parseInt(m[1], 10);
      if (value > max) max = value;
    }
  }

  const seq = max + 1;
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}
