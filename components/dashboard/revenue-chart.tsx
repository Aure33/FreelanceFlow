import { formatEuros } from "@/lib/invoicing";
import type { DashboardData } from "@/app/(app)/dashboard/actions";

// Graphe CA en barres empilées, HTML/CSS pur (aucune librairie de charts).
// Hauteurs proportionnelles au cumul max du dataset. Le dernier mois est mis
// en avant (`.peak`). Accessible : conteneur role="img" + aria-label descriptif.
export function RevenueChart({
  data,
}: {
  data: DashboardData["monthlyRevenue"];
}) {
  const totals = data.map((d) => d.paidCents + d.pendingCents);
  // max peut être 0 (compte vide) → on protège la division (barres à 0).
  const max = Math.max(1, ...totals);

  // aria-label généré depuis les vrais mois : période + mois du pic (dernier).
  const peakIndex = data.length - 1;
  const peak = data[peakIndex];
  const ariaLabel =
    data.length === 0
      ? "Évolution du chiffre d'affaires : aucune donnée."
      : `Évolution du chiffre d'affaires sur ${data.length} mois, de ${data[0].month} à ${peak.month}. Le mois de ${peak.month} totalise ${formatEuros(peak.paidCents)} encaissés et ${formatEuros(peak.pendingCents)} en attente.`;

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">
            Chiffre d&apos;affaires
          </h2>
          <div className="text-[13px] text-ink-3">
            Encaissé et en attente, 8 derniers mois
          </div>
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
          className="flex h-[240px] items-end gap-[14px] px-1 pt-2"
        >
          {data.map((d, i) => {
            const isPeak = i === peakIndex;
            const totalCents = d.paidCents + d.pendingCents;
            const paidH = ((d.paidCents / max) * 100).toFixed(1);
            const pendingH = ((d.pendingCents / max) * 100).toFixed(1);
            return (
              <div
                key={`${d.month}-${i}`}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-[10px]"
                title={`${d.month} · ${formatEuros(totalCents)}`}
              >
                <div className="flex h-full w-full max-w-[44px] flex-col justify-end gap-[3px]">
                  {d.pendingCents > 0 && (
                    <div
                      className="w-full rounded-[5px_5px_3px_3px] border border-accent-line bg-accent-soft"
                      style={{ height: `${pendingH}%` }}
                    />
                  )}
                  <div
                    className="w-full rounded-[5px_5px_3px_3px] bg-accent transition-[filter] duration-150 group-hover:brightness-[1.08]"
                    style={
                      isPeak
                        ? {
                            height: `${paidH}%`,
                            boxShadow: "0 0 0 3px var(--accent-soft)",
                          }
                        : { height: `${paidH}%` }
                    }
                  />
                </div>
                <div
                  className={`text-[12px] font-semibold ${
                    isPeak ? "text-accent-ink" : "text-ink-3"
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
