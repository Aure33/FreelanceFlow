import Link from "next/link";
import { Users } from "lucide-react";
import type { DashboardData } from "@/app/(app)/dashboard/actions";

// Mini-carte « Top clients · <période> » (barres de répartition).
// Largeur des barres proportionnelle au client le plus haut (1er = 100 %).
// `rangeLabel` = libellé serveur de la période sélectionnée (#65).
export function TopClients({
  topClients,
  rangeLabel,
}: {
  topClients: DashboardData["topClients"];
  rangeLabel: string;
}) {
  const items = topClients?.items ?? [];
  const empty = topClients === null || items.length === 0;
  // Le 1er client (trié desc côté serveur) fixe l'échelle des barres.
  const maxPct = items.length > 0 ? items[0].pct : 0;
  const barWidth = (pct: number) =>
    maxPct > 0 ? Math.round((pct / maxPct) * 100) : 0;

  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-[18px] shadow-sm">
      <div className="mb-3 flex items-center gap-[7px] text-[13px] font-semibold text-ink-3">
        <Users className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
        Top clients · {rangeLabel}
      </div>

      {empty ? (
        <div className="py-[18px] text-center text-[13px] text-ink-3">
          Aucun chiffre d&apos;affaires {rangeLabel}
        </div>
      ) : (
        <>
          {items.map((c) => (
            // Chaque client mène à sa fiche (#106).
            <Link
              key={c.clientId}
              href={`/clients/${c.clientId}`}
              aria-label={`Ouvrir la fiche ${c.clientName} — ${c.pct} %`}
              className="-mx-2 mb-[5px] flex items-center gap-2.5 rounded-sm px-2 py-[3px] transition-colors last:mb-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft"
            >
              <span className="w-[120px] truncate text-[13.5px] font-semibold">
                {c.clientName}
              </span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-2">
                <i
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${barWidth(c.pct)}%` }}
                />
              </span>
              <span className="num w-[42px] text-right text-[12px] text-ink-3">
                {c.pct} %
              </span>
            </Link>
          ))}
          {topClients.othersPct > 0 && (
            <div className="mb-[11px] flex items-center gap-2.5 last:mb-0">
              <span className="w-[120px] truncate text-[13.5px] font-semibold">
                Autres
              </span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-2">
                <i
                  className="block h-full rounded-full bg-ink-3"
                  style={{ width: `${barWidth(topClients.othersPct)}%` }}
                />
              </span>
              <span className="num w-[42px] text-right text-[12px] text-ink-3">
                {topClients.othersPct} %
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
