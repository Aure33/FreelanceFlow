import { Users } from "lucide-react";
import { TOP_CLIENTS } from "./mock-data";

// Mini-carte « Top clients · ce trimestre » (barres de répartition).
export function TopClients() {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-[18px] shadow-sm">
      <div className="mb-3 flex items-center gap-[7px] text-[13px] font-semibold text-ink-3">
        <Users className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
        Top clients · ce trimestre
      </div>
      {TOP_CLIENTS.map((c) => (
        <div key={c.name} className="mb-[11px] flex items-center gap-2.5 last:mb-0">
          <span className="w-[120px] truncate text-[13.5px] font-semibold">
            {c.name}
          </span>
          <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-surface-2">
            <i
              className={`block h-full rounded-full ${
                c.muted ? "bg-ink-3" : "bg-accent"
              }`}
              style={{ width: `${c.width}%` }}
            />
          </span>
          <span className="num w-[42px] text-right text-[12px] text-ink-3">
            {c.pct}
          </span>
        </div>
      ))}
    </div>
  );
}
