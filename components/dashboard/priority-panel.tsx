import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRIORITY_ITEMS } from "./mock-data";
import { Tag } from "./tag";

// Panneau latéral « À traiter en priorité » (largeur 380px dans la grille).
export function PriorityPanel() {
  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">
          À traiter en priorité
        </h2>
        <Tag tone="danger" className="ml-auto">
          2 en retard
        </Tag>
      </div>

      {PRIORITY_ITEMS.map((item) => (
        <div
          key={item.name}
          className="flex items-center gap-[13px] border-b border-line-soft px-pad py-[13px] transition-colors last:border-b-0 hover:bg-surface-2"
        >
          <div
            className={`grid h-9 w-9 flex-none place-items-center rounded-[9px] text-[13px] font-bold ${
              item.danger
                ? "bg-danger-soft text-danger-ink"
                : "bg-surface-2 text-ink-2"
            }`}
          >
            {item.initials}
          </div>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm font-semibold">{item.name}</b>
            <small className="text-[12.5px] text-ink-3">{item.meta}</small>
          </div>
          <div className="num text-right text-sm font-semibold">
            {item.amount}
            <small className="block font-medium text-[11.5px]">
              <Tag tone={item.tag.tone} className="px-[7px] py-px text-[11px]">
                {item.tag.label}
              </Tag>
            </small>
          </div>
        </div>
      ))}

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
