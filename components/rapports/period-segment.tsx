"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { parseReportsPeriod, type ReportsPeriod } from "@/lib/periods";

// Segment de période de la page Rapports (#65) — même mécanique que celui du
// tableau de bord : la sélection vit dans l'URL (?periode=), le serveur
// recalcule bornes, KPI, graphe et blocs Premium pour la période.
export function ReportsPeriodSegment({ year }: { year: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = parseReportsPeriod(searchParams.get("periode") ?? undefined);

  const periods: { id: ReportsPeriod; label: string }[] = [
    { id: "annee", label: `Année ${year}` },
    { id: "12mois", label: "12 derniers mois" },
    { id: "trimestre", label: "Trimestre" },
  ];

  function select(id: ReportsPeriod) {
    // « annee » est le défaut : URL propre, sans paramètre superflu.
    router.replace(id === "annee" ? "/rapports" : `/rapports?periode=${id}`, {
      scroll: false,
    });
  }

  return (
    <div
      role="group"
      aria-label="Période du rapport"
      className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
    >
      {periods.map((p) => {
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(p.id)}
            className={cn(
              "rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              isActive ? "bg-surface text-ink shadow-sm" : "text-ink-2",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
