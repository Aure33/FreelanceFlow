// Formatage de dates en français pour l'UI (paywall/abonnement #10, éditeur,
// projets). Centralisé ici pour éviter des implémentations divergentes.
//
// Fuseau FIXE Europe/Paris (#113) : ces libellés sont rendus une fois par le
// serveur (Vercel, UTC) puis par le navigateur (heure locale). Sans fuseau
// explicite, les deux rendus divergent autour de minuit → erreur d'hydratation
// React (#425/#422). Avec un fuseau fixe, serveur et client calculent la même
// chose, quel que soit le fuseau de la machine.

export const APP_TIME_ZONE = "Europe/Paris";

const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  timeZone: APP_TIME_ZONE,
});
const monthYearFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: APP_TIME_ZONE,
});
// en-CA formate nativement en AAAA-MM-JJ (format d'un <input type="date">).
const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: APP_TIME_ZONE,
});

// Année et mois (1-12) de l'instant, à Paris.
function parisYearMonth(date: Date): { year: number; month: number } {
  const [year, month] = isoDayFormatter.format(date).split("-").map(Number);
  return { year, month };
}

// Mois courant en toutes lettres (« juin »).
export function currentMonthLabel(now: Date = new Date()): string {
  return monthFormatter.format(now);
}

// « 1ᵉʳ juillet » — le 1ᵉʳ est invariant, seul le mois suivant varie.
export function nextMonthFirstLabel(now: Date = new Date()): string {
  const { year, month } = parisYearMonth(now);
  // Milieu du mois suivant en UTC : aucun risque de basculer de mois à Paris.
  const next = new Date(Date.UTC(year, month, 15));
  return `1ᵉʳ ${monthFormatter.format(next)}`;
}

// « janvier 2026 » — ancienneté du compte sur la page Abonnement.
export function memberSinceLabel(date: Date): string {
  return monthYearFormatter.format(date);
}

// Date courte (« 4 juil. 2026 ») — date de création d'un projet.
export function shortDateLabel(date: Date): string {
  return shortDateFormatter.format(date);
}

// Jour à Paris au format AAAA-MM-JJ (valeur d'un <input type="date">).
export function parisTodayInputValue(now: Date = new Date()): string {
  return isoDayFormatter.format(now);
}

// Année en cours à Paris.
export function parisCurrentYear(now: Date = new Date()): number {
  return parisYearMonth(now).year;
}
