"use client";

import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import type { Notifications } from "@/app/(app)/notifications";

// Titre affiché dans la topbar selon le premier segment de route.
const SEGMENT_TITLES: Record<string, string> = {
  dashboard: "Tableau de bord",
  clients: "Clients",
  projets: "Projets",
  devis: "Devis",
  factures: "Factures",
  documents: "Nouveau document",
  rapports: "Rapports",
  abonnement: "Abonnement",
  parametres: "Paramètres",
};

export function Topbar({
  notifications,
  menuOpen,
  onMenuToggle,
  menuButtonRef,
}: {
  notifications: Notifications;
  // Tiroir de navigation mobile (#96) — pilotés par AppShell.
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const title = SEGMENT_TITLES[segment] ?? "Freelance Flow";

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line bg-topbar px-4 backdrop-blur-[8px] sm:gap-[18px] sm:px-7 print:hidden">
      {/* Bouton menu (mobile uniquement, cible tactile 44 px). */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onMenuToggle}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
        aria-label={menuOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
        className="grid h-11 w-11 flex-none place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
      >
        {menuOpen ? (
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </button>

      <h1 className="min-w-0 truncate text-lg font-bold tracking-[-0.02em]">
        {title}
      </h1>

      {/* Recherche globale (#63) : palette ⌘K, déclencheur fidèle à la maquette. */}
      <SearchPalette />

      {/* Notifications réelles (#69) : cloche + badge + popover accessible. */}
      <NotificationsBell notifications={notifications} />
    </header>
  );
}
