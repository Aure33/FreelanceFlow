import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// En-tête de page (`.page-head`) + outils (segment période, export PDF).
// « Exporter en PDF » est branché (#64) sur GET /api/rapports/pdf (même infra
// Puppeteer que le PDF document #9). Le segment de période reste désactivé
// proprement (pas de filtrage par période : issue #65). Les outils sont
// masqués à l'impression (le PDF est la page imprimée par Puppeteer).
export function ReportsHeader({ year }: { year: number }) {
  return (
    <div className="mb-[22px] flex items-end gap-[18px]">
      <div>
        <div className="text-2xl font-extrabold tracking-[-0.03em]">
          Rapports
        </div>
        <div className="mt-[3px] text-sm text-ink-3">
          Votre activité en chiffres — année {year}.
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2.5 print:hidden">
        <div
          role="group"
          aria-label="Période (bientôt disponible)"
          className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
        >
          <button
            type="button"
            disabled
            title="Bientôt disponible"
            className="rounded-[7px] bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-sm disabled:cursor-not-allowed"
          >
            Année {year}
          </button>
          <button
            type="button"
            disabled
            title="Bientôt disponible"
            className="rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 disabled:cursor-not-allowed"
          >
            12 derniers mois
          </button>
          <button
            type="button"
            disabled
            title="Bientôt disponible"
            className="rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 disabled:cursor-not-allowed"
          >
            Trimestre
          </button>
        </div>
        <Button asChild variant="default">
          <a href="/api/rapports/pdf" title="Télécharger le rapport en PDF">
            <Download strokeWidth={2} />
            Exporter en PDF
          </a>
        </Button>
      </div>
    </div>
  );
}
