// Calcul des initiales à partir d'un nom (ou d'un e-mail en repli).
// Fonction pure, sans dépendance serveur : utilisable aussi bien côté
// Server Components (lib/auth/session.ts) que côté Client Components
// (ex. avatar de la page Paramètres, mis à jour en direct avec la saisie).
export function computeInitials(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "U").toUpperCase();
}
