import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Fil d'Ariane de la fiche projet (`.crumbs`). Même hiérarchie visuelle que la
// maquette ; placé en tête de contenu (notre topbar est partagée, pilotée par la
// route).
export function ProjectBreadcrumb({ current }: { current: string }) {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="mb-[22px] flex items-center gap-2 text-sm"
    >
      <Link
        href="/projets"
        className="font-medium text-ink-3 transition-colors hover:text-accent-ink"
      >
        Projets
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-ink-3" strokeWidth={2} aria-hidden />
      <span className="font-bold tracking-[-0.01em]" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
