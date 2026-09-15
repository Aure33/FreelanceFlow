import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  FileText,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { CurrencyIcon } from "@/components/icons/currency-icon";
import { formatEuros } from "@/lib/invoicing";
import { eurosAmount, formatPctDelta, plural } from "@/components/rapports/format";
import type { DashboardData } from "@/app/(app)/dashboard/actions";

// Teinte de la pastille d'icône (a=accent, w=warn, d=danger, g=ok).
type Tone = "a" | "w" | "d" | "g";
type KpiIcon = "revenue" | "clock" | "alert" | "quote";

// Pastilles d'icône colorées selon le ton.
const IC_TONE: Record<Tone, string> = {
  a: "bg-accent-soft text-accent-ink",
  w: "bg-warn-soft text-warn-ink",
  d: "bg-danger-soft text-danger-ink",
  g: "bg-ok-soft text-ok-ink",
};

// Icône par KPI : lucide quand le glyphe correspond à la maquette, icône custom
// (CurrencyIcon) pour le chiffre d'affaires (pas d'équivalent lucide fidèle).
const KPI_ICON: Record<KpiIcon, LucideIcon | typeof CurrencyIcon> = {
  revenue: CurrencyIcon,
  clock: Clock,
  alert: TriangleAlert,
  quote: FileText,
};

export function KpiCards({
  kpis,
  comparisonLabel,
}: {
  kpis: DashboardData["kpis"];
  // « vs mois dernier » / « vs trimestre dernier » / « vs année dernière » (#65).
  comparisonLabel: string;
}) {
  return (
    <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2">
      {/* CA encaissé (HT) — accent */}
      <KpiCard
        tone="a"
        icon="revenue"
        href="/factures?statut=paye"
        label="Chiffre d'affaires encaissé"
        value={eurosAmount(kpis.caEncaisseCents)}
        unit="€"
        foot={
          kpis.caEncaisseDeltaPct === null ? (
            <span>Aucune donnée sur la période précédente</span>
          ) : (
            <>
              <Delta
                positive={kpis.caEncaisseDeltaPct >= 0}
                rising={kpis.caEncaisseDeltaPct >= 0}
              >
                {formatPctDelta(kpis.caEncaisseDeltaPct)}
              </Delta>{" "}
              <span>{comparisonLabel}</span>
            </>
          )
        }
      />

      {/* Factures en attente (HT) — warn */}
      <KpiCard
        tone="w"
        icon="clock"
        href="/factures?statut=envoye"
        label="Factures en attente"
        value={eurosAmount(kpis.enAttenteCents)}
        unit="€"
        foot={
          <>
            <span className="num font-semibold text-ink-2">
              {kpis.enAttenteCount} facture{plural(kpis.enAttenteCount)}
            </span>{" "}
            <span>· à encaisser</span>
          </>
        }
      />

      {/* En retard de paiement (HT) — danger */}
      <KpiCard
        tone="d"
        icon="alert"
        href="/factures?statut=en_retard"
        label="En retard de paiement"
        value={eurosAmount(kpis.enRetardCents)}
        unit="€"
        foot={
          <>
            <span className="num font-semibold text-danger">
              {kpis.enRetardCount} facture{plural(kpis.enRetardCount)}
            </span>{" "}
            <span>· à relancer</span>
          </>
        }
      />

      {/* Devis à relancer — ok */}
      <KpiCard
        tone="g"
        icon="quote"
        href="/devis?statut=envoye"
        label="Devis à relancer"
        value={String(kpis.devisARelancerCount)}
        unit="en attente"
        foot={
          <>
            <span className="num font-semibold text-ink-2">
              {formatEuros(kpis.devisPotentielCents)}
            </span>{" "}
            <span>· potentiel</span>
          </>
        }
      />
    </section>
  );
}

// Chaque carte mène à la liste filtrée correspondante (#106) — filtres
// `?statut=` existants (#70), aucune requête ajoutée. Nuance : l'indicateur
// « encaissé » est borné à la période, la liste des payées ne l'est pas.
function KpiCard({
  tone,
  icon,
  href,
  label,
  value,
  unit,
  foot,
}: {
  tone: Tone;
  icon: KpiIcon;
  href: string;
  label: string;
  value: string;
  unit: string;
  foot: React.ReactNode;
}) {
  const Icon = KPI_ICON[icon];
  return (
    <Link
      href={href}
      className="relative block overflow-hidden rounded-lg border border-line bg-surface p-5 shadow-sm transition-colors hover:border-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft focus-visible:border-accent"
    >
      <div
        className={`mb-[14px] grid h-[34px] w-[34px] place-items-center rounded-[9px] ${IC_TONE[tone]}`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </div>
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="num mb-2 mt-[6px] text-[27px] font-bold tracking-[-0.02em]">
        {value}{" "}
        <small className="text-base font-semibold text-ink-3">{unit}</small>
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
