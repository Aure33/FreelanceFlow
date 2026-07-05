// Formatage de dates en français pour l'UI du paywall/abonnement (issue #10).
// Centralisé ici pour éviter 3 implémentations divergentes (modale paywall,
// jauge sidebar, page Abonnement).

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });
const monthYearFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

// Mois courant en toutes lettres (« juin »).
export function currentMonthLabel(): string {
  return monthFormatter.format(new Date());
}

// « 1ᵉʳ juillet » — le 1ᵉʳ est invariant, seul le mois suivant varie.
export function nextMonthFirstLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `1ᵉʳ ${monthFormatter.format(next)}`;
}

// « janvier 2026 » — ancienneté du compte sur la page Abonnement.
export function memberSinceLabel(date: Date): string {
  return monthYearFormatter.format(date);
}
