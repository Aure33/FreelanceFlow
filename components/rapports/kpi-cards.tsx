import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReportsData } from "@/app/(app)/rapports/actions";
import { eurosAmount, formatDaysDelta, formatPctDelta, plural } from "./format";

// 4 cartes KPI (`.kpis` de la maquette Rapports.html). Contrairement au
// tableau de bord, ces cartes n'ont PAS de pastille d'icône (absente de la
// maquette Rapports — vérifié : `.kpi` n'y définit aucune classe `.ic`).
export function KpiCards({ data }: { data: ReportsData }) {
  const { kpis, labels } = data;

  return (
    <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2 print:break-inside-avoid">
      {/* CA encaissé */}
      <KpiCard
        href="/factures?statut=paye"
        label={labels.caTitle}
        value={eurosAmount(kpis.caEncaisseCents)}
        unit="€ HT"
        foot={
          kpis.caEncaisseDeltaPct === null ? (
            <span>Aucune donnée à comparer sur la période précédente</span>
          ) : (
            <>
              <Delta
                positive={kpis.caEncaisseDeltaPct >= 0}
                rising={kpis.caEncaisseDeltaPct >= 0}
              >
                {formatPctDelta(kpis.caEncaisseDeltaPct)}
              </Delta>{" "}
              <span>{labels.caComparison}</span>
            </>
          )
        }
      />

      {/* En attente de paiement */}
      <KpiCard
        href="/factures?statut=envoye"
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
        href="/factures?statut=paye"
        label="Délai moyen de paiement"
        value={
          kpis.delaiMoyenPaiementJours === null
            ? "—"
            : String(kpis.delaiMoyenPaiementJours)
        }
        unit={kpis.delaiMoyenPaiementJours === null ? "" : "jours"}
        foot={
          kpis.delaiMoyenPaiementJours === null ? (
            <span>Aucune facture payée sur la période</span>
          ) : kpis.delaiMoyenPaiementDeltaJours === null ? (
            <span>Aucune donnée à comparer sur la période précédente</span>
          ) : (
            <>
              <Delta
                positive={kpis.delaiMoyenPaiementDeltaJours <= 0}
                rising={kpis.delaiMoyenPaiementDeltaJours > 0}
              >
                {formatDaysDelta(kpis.delaiMoyenPaiementDeltaJours)}
              </Delta>{" "}
              <span>{labels.delayComparison}</span>
            </>
          )
        }
      />

      {/* Taux d'acceptation des devis */}
      <KpiCard
        href="/devis?statut=accepte"
        label="Taux d'acceptation des devis"
        value={kpis.devisDecidesCount === 0 ? "—" : String(kpis.tauxAcceptationDevisPct)}
        unit={kpis.devisDecidesCount === 0 ? "" : "%"}
        foot={
          kpis.devisDecidesCount === 0 ? (
            <span>Aucun devis décidé {labels.quotesFoot}</span>
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

// Chaque carte mène à la liste filtrée correspondante, comme sur le tableau
// de bord (#106). Les indicateurs sont bornés à la période, les listes non.
function KpiCard({
  href,
  label,
  value,
  unit,
  foot,
}: {
  href: string;
  label: string;
  value: string;
  unit: string;
  foot: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-line bg-surface p-5 shadow-sm transition-colors hover:border-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:border-accent"
    >
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
    </Link>
  );
}

// Pastille de delta — la COULEUR dit si l'évolution est favorable (vert) ou
// défavorable (rouge), la FLÈCHE dit le sens de la variation (hausse / baisse).
// Les deux sont indépendants : un délai de paiement qui baisse est vert avec
// une flèche descendante.
function Delta({
  positive,
  rising,
  children,
}: {
  positive: boolean;
  rising: boolean;
  children: React.ReactNode;
}) {
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`num inline-flex items-center gap-[3px] font-semibold ${
        positive ? "text-ok-ink" : "text-danger"
      }`}
    >
      <Arrow className="h-[13px] w-[13px]" strokeWidth={2.4} aria-hidden />
      {children}
    </span>
  );
}
