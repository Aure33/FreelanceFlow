"use client";

import { usePathname } from "next/navigation";
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

export function Topbar({ notifications }: { notifications: Notifications }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const title = SEGMENT_TITLES[segment] ?? "Freelance Flow";

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-[18px] border-b border-line bg-topbar px-7 backdrop-blur-[8px] print:hidden">
      <h1 className="text-lg font-bold tracking-[-0.02em]">{title}</h1>

      {/* Recherche globale (#63) : palette ⌘K, déclencheur fidèle à la maquette. */}
      <SearchPalette />

      {/* Notifications réelles (#69) : cloche + badge + popover accessible. */}
      <NotificationsBell notifications={notifications} />
    </header>
  );
}
