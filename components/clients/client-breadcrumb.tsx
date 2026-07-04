import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Fil d'Ariane (`.crumbs` de la maquette). Dans les maquettes il vit dans la
// topbar ; notre topbar applicative est partagée et pilotée par la route (titre),
// on place donc le fil en tête de contenu — même hiérarchie visuelle.
export function ClientBreadcrumb({ current }: { current: string }) {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="mb-[22px] flex items-center gap-2 text-sm"
    >
      <Link
        href="/clients"
        className="font-medium text-ink-3 transition-colors hover:text-accent-ink"
      >
        Clients
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-ink-3" strokeWidth={2} aria-hidden />
      <span className="font-bold tracking-[-0.01em]" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
