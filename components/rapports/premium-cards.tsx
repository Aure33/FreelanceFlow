import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReportsData } from "@/app/(app)/rapports/actions";
import { formatEuros } from "@/lib/invoicing";
import { Tag } from "@/components/dashboard/tag";

// Seuil au-delà duquel un délai de paiement client est mis en évidence en
// orange (`.late` de la maquette). Aucune règle exacte n'est donnée par la
// spec — 30 jours est un choix raisonnable (interprétation), cohérent avec
// les délais de paiement usuels en France (30 j net).
const LATE_DELAY_THRESHOLD_DAYS = 30;

// Largeurs décoratives fixes utilisées derrière le flou pour un compte
// "free" — AUCUNE vraie donnée (ni nom de client, ni montant, ni délai) :
// le serveur ne renvoie rien à cet endroit pour un compte free, ces valeurs
// ne représentent donc rien de réel.
const DECORATIVE_WIDTHS = [86, 64, 48, 34, 22];

// —— Carte « Répartition du CA par client » ——————————————————————————————

export function ClientRevenueCard({
  data,
}: {
  data: ReportsData["premium"]["clientRevenueBreakdown"];
}) {
  if (data === null) {
    return (
      <LockedCard
        ariaLabel="Répartition du chiffre d'affaires par client — fonctionnalité Premium"
        title="Répartition du CA par client"
        description="Identifiez vos clients les plus rentables et votre dépendance commerciale."
      >
        {DECORATIVE_WIDTHS.map((w, i) => (
          <ClientBar key={i} name="•••••" width={w} value="—" />
        ))}
      </LockedCard>
    );
  }

  const amounts = [
    ...data.items.map((c) => c.cents),
    ...(data.othersCents > 0 ? [data.othersCents] : []),
  ];
  const max = Math.max(1, ...amounts);

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <CardHead title="Répartition du CA par client" />
      <div className="p-pad">
        {data.items.map((c) => (
          <ClientBar
            key={c.clientName}
            name={c.clientName}
            width={(c.cents / max) * 100}
            value={formatEuros(c.cents)}
          />
        ))}
        {data.othersCents > 0 && (
          <ClientBar
            name="Autres"
            width={(data.othersCents / max) * 100}
            value={formatEuros(data.othersCents)}
          />
        )}
      </div>
    </section>
  );
}

// —— Carte « Délais de paiement par client » —————————————————————————————

export function PaymentDelaysCard({
  data,
}: {
  data: ReportsData["premium"]["paymentDelaysByClient"];
}) {
  if (data === null) {
    return (
      <LockedCard
        ariaLabel="Délais de paiement par client — fonctionnalité Premium"
        title="Délais de paiement par client"
        description="Repérez les mauvais payeurs et ajustez vos conditions de règlement."
      >
        {DECORATIVE_WIDTHS.map((w, i) => (
          <DelayRow key={i} name="•••••" width={w} days="—" late={i === 3} />
        ))}
      </LockedCard>
    );
  }

  const max = Math.max(1, data.averageDays, ...data.items.map((c) => c.days));

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <CardHead title="Délais de paiement par client" />
      <div className="p-pad">
        {data.items.map((c) => (
          <DelayRow
            key={c.clientName}
            name={c.clientName}
            width={(c.days / max) * 100}
            days={`${c.days} j`}
            late={c.days > LATE_DELAY_THRESHOLD_DAYS}
          />
        ))}
        <DelayRow
          name="Moyenne"
          width={(data.averageDays / max) * 100}
          days={`${data.averageDays} j`}
          late={data.averageDays > LATE_DELAY_THRESHOLD_DAYS}
        />
      </div>
    </section>
  );
}

// —— Sous-composants partagés ————————————————————————————————————————————

function CardHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
      <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
    </div>
  );
}

function ClientBar({
  name,
  width,
  value,
}: {
  name: string;
  width: number;
  value: string;
}) {
  return (
    <div className="mb-[13px] flex items-center gap-3 last:mb-0">
      <span className="w-[130px] truncate text-[13.5px] font-semibold">
        {name}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <i
          className="block h-full rounded-full bg-accent"
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="num w-14 text-right text-xs text-ink-3">{value}</span>
    </div>
  );
}

function DelayRow({
  name,
  width,
  days,
  late,
}: {
  name: string;
  width: number;
  days: string;
  late: boolean;
}) {
  return (
    <div className="mb-[13px] flex items-center gap-3 last:mb-0">
      <span className="w-[130px] truncate text-[13.5px] font-semibold">
        {name}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <i
          className={`block h-full rounded-full ${late ? "bg-warn" : "bg-ok"}`}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="num w-14 text-right text-xs text-ink-3">{days}</span>
    </div>
  );
}

// Carte verrouillée (compte "free") : contenu décoratif flouté (aria-hidden,
// aucune vraie donnée) + voile avec cadenas, texte et CTA vers l'abonnement.
function LockedCard({
  ariaLabel,
  title,
  description,
  children,
}: {
  ariaLabel: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
      aria-label={ariaLabel}
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
        <span className="ml-auto">
          <Tag tone="accent">Premium</Tag>
        </span>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none select-none p-pad opacity-55 blur-sm"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center">
        <span className="grid h-[42px] w-[42px] place-items-center rounded-[12px] border border-line bg-surface text-ink-2 shadow-md">
          <Lock className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <b className="text-[14.5px] font-bold tracking-[-0.01em]">
          Réservé au forfait Premium
        </b>
        <p className="max-w-[300px] text-[13px] leading-[1.5] text-ink-2">
          {description}
        </p>
        <Link
          href="/abonnement"
          className="inline-flex h-8 items-center rounded-sm border border-accent bg-accent px-[11px] text-[13px] font-semibold text-on-accent shadow-sm transition-colors hover:border-accent-hover hover:bg-accent-hover"
        >
          Passer en Premium — 15 €/mois
        </Link>
      </div>
    </section>
  );
}
