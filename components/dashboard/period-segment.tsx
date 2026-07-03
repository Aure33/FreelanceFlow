"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Segment de période — reproduit `.segment` de la maquette.
// Interaction purement cosmétique (change l'onglet actif), aucune donnée refiltrée.
const PERIODS = [
  { id: "mois", label: "Ce mois" },
  { id: "trim", label: "Trimestre" },
  { id: "annee", label: "Année" },
] as const;

export function PeriodSegment() {
  const [active, setActive] = useState<string>("mois");

  return (
    <div
      role="group"
      aria-label="Période affichée"
      className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
    >
      {PERIODS.map((p) => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => setActive(p.id)}
            className={cn(
              "rounded-[7px] px-[14px] py-[6px] text-[13px] font-semibold transition-colors",
              isActive ? "bg-surface text-ink shadow-sm" : "text-ink-2"
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
