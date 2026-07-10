import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatEuros } from "@/lib/invoicing";
import { computeInitials } from "@/lib/auth/initials";
import type { DashboardData } from "@/app/(app)/dashboard/actions";
import { Tag } from "./tag";

// Panneau latéral « À traiter en priorité » (largeur 380px dans la grille).
export function PriorityPanel({
  priority,
}: {
  priority: DashboardData["priority"];
}) {
  const { overdueCount, items } = priority;

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">
          À traiter en priorité
        </h2>
        {overdueCount > 0 && (
          <Tag tone="danger" className="ml-auto">
            {overdueCount} en retard
          </Tag>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-pad py-[26px] text-center text-[13px] text-ink-3">
          Rien à traiter pour le moment · tout est à jour
        </div>
      ) : (
        items.map((item, i) => {
          const danger = item.kind === "facture_retard";
          const meta =
            item.kind === "facture_retard"
              ? `${item.number} · échéance dépassée de ${item.days} j`
              : `${item.number} · envoyé il y a ${item.days} jour${
                  item.days > 1 ? "s" : ""
                }`;
          const tag = danger
            ? { tone: "danger" as const, label: "En retard" }
            : { tone: "warn" as const, label: "À relancer" };
          return (
            <div
              key={`${item.number}-${i}`}
              className="flex items-center gap-[13px] border-b border-line-soft px-pad py-[13px] transition-colors last:border-b-0 hover:bg-surface-2"
            >
              <div
                className={`grid h-9 w-9 flex-none place-items-center rounded-[9px] text-[13px] font-bold ${
                  danger
                    ? "bg-danger-soft text-danger-ink"
                    : "bg-surface-2 text-ink-2"
                }`}
              >
                {computeInitials(item.clientName)}
              </div>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">
                  {item.clientName}
                </b>
                <small className="text-[12.5px] text-ink-3">{meta}</small>
              </div>
              <div className="num text-right text-sm font-semibold">
                {formatEuros(item.amountTtcCents)}
                <small className="block text-[11.5px] font-medium">
                  <Tag tone={tag.tone} className="px-[7px] py-px text-[11px]">
                    {tag.label}
                  </Tag>
                </small>
              </div>
            </div>
          );
        })
      )}

      <Link
        href="/factures"
        className="flex items-center justify-center gap-1.5 border-t border-line-soft p-[13px] text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
      >
        Voir toutes les pièces à traiter
        <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2} />
      </Link>
    </section>
  );
}
