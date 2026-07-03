import {
  ArrowUpRight,
  Clock,
  FileText,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { CurrencyIcon } from "@/components/icons/currency-icon";
import { KPIS, type KpiIcon, type Tone } from "./mock-data";

// Pastilles d'icône colorées selon le ton (a=accent, w=warn, d=danger, g=ok).
const IC_TONE: Record<Tone, string> = {
  a: "bg-accent-soft text-accent-ink",
  w: "bg-warn-soft text-warn-ink",
  d: "bg-danger-soft text-danger-ink",
  g: "bg-ok-soft text-ok-ink",
};

// Icône par KPI : lucide quand le glyphe correspond à la maquette, icône custom
// (CurrencyIcon) pour le chiffre d'affaires (pas d'équivalent lucide fidèle).
const KPI_ICON: Record<KpiIcon, LucideIcon | typeof CurrencyIcon> = {
  revenue: CurrencyIcon,
  clock: Clock,
  alert: TriangleAlert,
  quote: FileText,
};

export function KpiCards() {
  return (
    <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2">
      {KPIS.map((kpi) => {
        const Icon = KPI_ICON[kpi.icon];
        return (
        <div
          key={kpi.label}
          className="relative overflow-hidden rounded-lg border border-line bg-surface p-5 shadow-sm"
        >
          <div
            className={`mb-[14px] grid h-[34px] w-[34px] place-items-center rounded-[9px] ${IC_TONE[kpi.tone]}`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </div>
          <div className="text-[13px] font-semibold text-ink-2">{kpi.label}</div>
          <div className="num mb-2 mt-[6px] text-[27px] font-bold tracking-[-0.02em]">
            {kpi.value} <small className="text-base font-semibold text-ink-3">{kpi.unit}</small>
          </div>
          <div className="flex items-center gap-[7px] text-[12.5px] text-ink-3">
            {kpi.foot.type === "delta" ? (
              <>
                <span
                  className={`num inline-flex items-center gap-[3px] font-semibold ${
                    kpi.foot.direction === "up" ? "text-ok-ink" : "text-danger"
                  }`}
                >
                  <ArrowUpRight
                    className="h-[13px] w-[13px]"
                    strokeWidth={2.4}
                    aria-hidden
                  />
                  {kpi.foot.delta}
                </span>{" "}
                {kpi.foot.text}
              </>
            ) : (
              <>
                <span
                  className={`num font-semibold ${
                    kpi.foot.strongTone === "danger" ? "text-danger" : "text-ink-2"
                  }`}
                >
                  {kpi.foot.strong}
                </span>{" "}
                {kpi.foot.text}
              </>
            )}
          </div>
        </div>
        );
      })}
    </section>
  );
}
