import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportsPeriod } from "@/lib/periods";
import { ReportsPeriodSegment } from "./period-segment";

// En-tête de page (`.page-head`) + outils (segment période, export PDF).
// « Exporter en PDF » est branché (#64) sur GET /api/rapports/pdf (même infra
// Puppeteer que le PDF document #9) — l'export emporte la période
// sélectionnée. Le segment de période est branché (#65) : la sélection vit
// dans l'URL. Les outils sont masqués à l'impression (le PDF est la page
// imprimée par Puppeteer).
export function ReportsHeader({
  year,
  period,
  subtitle,
}: {
  year: number;
  period: ReportsPeriod;
  subtitle: string;
}) {
  const pdfHref =
    period === "annee"
      ? "/api/rapports/pdf"
      : `/api/rapports/pdf?periode=${period}`;

  return (
    <div className="mb-[22px] flex flex-wrap items-end gap-[18px]">
      <div>
        <div className="text-2xl font-extrabold tracking-[-0.03em]">
          Rapports
        </div>
        <div className="mt-[3px] text-sm text-ink-3">
          Votre activité en chiffres — {subtitle}.
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5 print:hidden">
        <ReportsPeriodSegment year={year} />
        <Button asChild variant="default">
          <a href={pdfHref} title="Télécharger le rapport en PDF">
            <Download strokeWidth={2} />
            Exporter en PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
