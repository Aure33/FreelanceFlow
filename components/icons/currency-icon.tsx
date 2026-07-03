import type { SVGProps } from "react";

// Icône « chiffre d'affaires » — tracé exact de la maquette (signe monétaire en « S »).
// Extrait en composant réutilisable : pas d'équivalent lucide fidèle (DollarSign = $
// sémantiquement faux dans une app en €, Euro change le dessin). API alignée sur lucide
// (viewBox 24, stroke currentColor, coins arrondis) pour un usage interchangeable.
export function CurrencyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
