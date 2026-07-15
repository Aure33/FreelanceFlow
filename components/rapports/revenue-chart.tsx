import type { ReportsData } from "@/app/(app)/rapports/actions";
import { formatEuros } from "@/lib/invoicing";

// Graphe CA en barres empilées, HTML/CSS pur (aucune librairie de charts) —
// même technique que `components/dashboard/revenue-chart.tsx`, adapté aux
// mois de la PÉRIODE sélectionnée (12 en année/12 mois glissants, 3 en
// trimestre — #65). Visible sur tous les plans (pas de verrou Premium).
export function RevenueChart({ data }: { data: ReportsData }) {
  const { labels, monthlyRevenue } = data;
  const totals = monthlyRevenue.map((d) => d.paidCents + d.pendingCents);
  const max = Math.max(1, ...totals);

  // Mois du point le plus haut, pour l'aria-label dynamique.
  const peakIndex = totals.reduce(
    (best, total, i) => (total > totals[best] ? i : best),
    0,
  );
  const hasData = totals.some((t) => t > 0);

  const ariaLabel = hasData
    ? `Chiffre d'affaires mensuel — ${labels.subtitle}, point haut en ${monthlyRevenue[peakIndex].month} à ${formatEuros(totals[peakIndex])}.`
    : `Chiffre d'affaires mensuel — ${labels.subtitle}, aucune donnée pour l'instant.`;

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm print:break-inside-avoid">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">
            Évolution du chiffre d&apos;affaires
          </h2>
          <div className="text-[13px] text-ink-3">facturé par mois, HT</div>
        </div>
        <div className="ml-auto flex items-center gap-[18px]">
          <span className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-ink-2">
            <i className="h-[11px] w-[11px] rounded-[3px] bg-accent" />
            Encaissé
          </span>
          <span className="inline-flex items-center gap-[7px] text-[12.5px] font-medium text-ink-2">
            <i className="h-[11px] w-[11px] rounded-[3px] border border-accent-line bg-accent-soft" />
            En attente
          </span>
        </div>
      </div>
      <div className="p-pad">
        <div
          role="img"
          aria-label={ariaLabel}
          className="flex h-[250px] items-end gap-[14px] px-1 pt-2"
        >
          {monthlyRevenue.map((d, i) => {
            const peak = hasData && i === peakIndex;
            const paidH = ((d.paidCents / max) * 100).toFixed(1);
            const pendingH = ((d.pendingCents / max) * 100).toFixed(1);
            return (
              <div
                key={d.month}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-[10px]"
                title={`${d.month} · ${formatEuros(d.paidCents + d.pendingCents)}`}
              >
                <div className="flex h-full w-full max-w-[44px] flex-col justify-end gap-[3px]">
                  {d.pendingCents > 0 && (
                    <div
                      className="w-full rounded-[5px_5px_3px_3px] border border-accent-line bg-accent-soft"
                      style={{ height: `${pendingH}%` }}
                    />
                  )}
                  {d.paidCents > 0 && (
                    <div
                      className="w-full rounded-[5px_5px_3px_3px] bg-accent transition-[filter] duration-150 group-hover:brightness-[1.08]"
                      style={
                        peak
                          ? {
                              height: `${paidH}%`,
                              boxShadow: "0 0 0 3px var(--accent-soft)",
                            }
                          : { height: `${paidH}%` }
                      }
                    />
                  )}
                </div>
                <div
                  className={`text-[12px] font-semibold ${
                    peak ? "text-accent-ink" : "text-ink-3"
                  }`}
                >
                  {d.month}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
