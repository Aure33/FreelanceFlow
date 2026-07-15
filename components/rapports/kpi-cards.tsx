import { ArrowUpRight } from "lucide-react";
import type { ReportsData } from "@/app/(app)/rapports/actions";
import { eurosAmount, formatDaysDelta, formatPctDelta, plural } from "./format";

// 4 cartes KPI (`.kpis` de la maquette Rapports.html). Contrairement au
// tableau de bord, ces cartes n'ont PAS de pastille d'icône (absente de la
// maquette Rapports — vérifié : `.kpi` n'y définit aucune classe `.ic`).
export function KpiCards({ data }: { data: ReportsData }) {
  const { year, kpis } = data;
  const prevYear = year - 1;

  return (
    <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2 print:break-inside-avoid">
      {/* CA encaissé */}
      <KpiCard
        label={`CA encaissé en ${year}`}
        value={eurosAmount(kpis.caEncaisseCents)}
        unit="€ HT"
        foot={
          kpis.caEncaisseDeltaPct === null ? (
            <span>Aucune donnée à comparer sur {prevYear}</span>
          ) : (
            <>
              <Delta positive={kpis.caEncaisseDeltaPct >= 0}>
                {formatPctDelta(kpis.caEncaisseDeltaPct)}
              </Delta>{" "}
              <span>vs {prevYear} à date</span>
            </>
          )
        }
      />

      {/* En attente de paiement */}
      <KpiCard
        label="En attente de paiement"
        value={eurosAmount(kpis.enAttenteCents)}
        unit="€ HT"
        foot={
          <span>
            {kpis.enAttenteCount} facture{plural(kpis.enAttenteCount)} émise
            {plural(kpis.enAttenteCount)} non réglée{plural(kpis.enAttenteCount)}
          </span>
        }
      />

      {/* Délai moyen de paiement */}
      <KpiCard
        label="Délai moyen de paiement"
        value={
          kpis.delaiMoyenPaiementJours === null
            ? "—"
            : String(kpis.delaiMoyenPaiementJours)
        }
        unit={kpis.delaiMoyenPaiementJours === null ? "" : "jours"}
        foot={
          kpis.delaiMoyenPaiementJours === null ? (
            <span>Aucune facture payée cette année</span>
          ) : kpis.delaiMoyenPaiementDeltaJours === null ? (
            <span>Aucune donnée à comparer sur {prevYear}</span>
          ) : (
            <>
              <Delta positive={kpis.delaiMoyenPaiementDeltaJours <= 0}>
                {formatDaysDelta(kpis.delaiMoyenPaiementDeltaJours)}
              </Delta>{" "}
              <span>vs {prevYear}</span>
            </>
          )
        }
      />

      {/* Taux d'acceptation des devis */}
      <KpiCard
        label="Taux d'acceptation des devis"
        value={kpis.devisDecidesCount === 0 ? "—" : String(kpis.tauxAcceptationDevisPct)}
        unit={kpis.devisDecidesCount === 0 ? "" : "%"}
        foot={
          kpis.devisDecidesCount === 0 ? (
            <span>Aucun devis décidé cette année</span>
          ) : (
            <span>
              {kpis.devisAcceptesCount} devis accepté
              {plural(kpis.devisAcceptesCount)} sur {kpis.devisDecidesCount}{" "}
              décidé{plural(kpis.devisDecidesCount)}
            </span>
          )
        }
      />
    </section>
  );
}

function KpiCard({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: string;
  unit: string;
  foot: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="num mb-2 mt-[6px] text-[27px] font-bold tracking-[-0.02em]">
        {value}{" "}
        {unit ? (
          <small className="text-base font-semibold text-ink-3">{unit}</small>
        ) : null}
      </div>
      <div className="flex items-center gap-[7px] text-[12.5px] text-ink-3">
        {foot}
      </div>
    </div>
  );
}

// Pastille de delta coloré (vert = évolution positive, rouge = négative) —
// reproduit `.delta.up` / `.delta.down`. Icône unique (flèche montante) quelle
// que soit la direction : la maquette n'a qu'un seul tracé SVG pour les deux
// classes (le sens de la flèche ne code pas le signe, seule la couleur le fait).
function Delta({
  positive,
  children,
}: {
  positive: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`num inline-flex items-center gap-[3px] font-semibold ${
        positive ? "text-ok-ink" : "text-danger"
      }`}
    >
      <ArrowUpRight className="h-[13px] w-[13px]" strokeWidth={2.4} aria-hidden />
      {children}
    </span>
  );
}
