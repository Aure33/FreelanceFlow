"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { parseDashboardPeriod, type DashboardPeriod } from "@/lib/periods";

// Segment de période — reproduit `.segment` de la maquette. Branché (#65) :
// la sélection vit dans l'URL (?periode=) — partageable, rafraîchissable — et
// re-rend la page serveur avec les données de la période sélectionnée.
const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: "mois", label: "Ce mois" },
  { id: "trimestre", label: "Trimestre" },
  { id: "annee", label: "Année" },
];

export function PeriodSegment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = parseDashboardPeriod(searchParams.get("periode") ?? undefined);

  function select(id: DashboardPeriod) {
    // « mois » est le défaut : URL propre, sans paramètre superflu.
    router.replace(id === "mois" ? "/dashboard" : `/dashboard?periode=${id}`, {
      scroll: false,
    });
  }

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
            onClick={() => select(p.id)}
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
