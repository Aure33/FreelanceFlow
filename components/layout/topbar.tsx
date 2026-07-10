"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";

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

export function Topbar() {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const title = SEGMENT_TITLES[segment] ?? "Freelance Flow";

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-[18px] border-b border-line bg-topbar px-7 backdrop-blur-[8px] print:hidden">
      <h1 className="text-lg font-bold tracking-[-0.02em]">{title}</h1>

      <div className="ml-auto flex w-[280px] items-center gap-[9px] rounded-md border border-line bg-surface px-[13px] py-2 text-ink-3 transition-shadow focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent-soft">
        <Search className="h-4 w-4 flex-none" strokeWidth={2} aria-hidden />
        <input
          type="search"
          placeholder="Rechercher un client, une facture…"
          className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <span className="num rounded-[5px] border border-line px-[5px] py-px text-[11px] text-ink-3">
          ⌘K
        </span>
      </div>

      <button
        type="button"
        title="Notifications"
        aria-label="Notifications"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Bell className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
      </button>
    </header>
  );
}
