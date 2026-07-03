import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GREETING } from "./mock-data";
import { PeriodSegment } from "./period-segment";

// En-tête du tableau de bord (`.page-head`) : salutation + outils (période, Créer).
export function DashboardHeader() {
  return (
    <div className="mb-6 flex items-end gap-[18px]">
      <div>
        <div className="text-2xl font-extrabold tracking-[-0.03em]">
          Bonjour {GREETING.name}{" "}
          <span className="font-semibold text-ink-3">👋</span>
        </div>
        <div className="mt-[3px] text-sm text-ink-3">{GREETING.date}</div>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <PeriodSegment />
        <Button variant="primary" type="button">
          <Plus strokeWidth={2} />
          Créer
        </Button>
      </div>
    </div>
  );
}
