"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutGrid,
  Layers,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import type { UserProfile } from "@/lib/auth/session";
import type { Usage } from "@/app/(app)/abonnement/actions";
import type { NavCounts } from "@/app/(app)/nav-counts";
import { nextMonthFirstLabel } from "@/lib/date-fr";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  // Clé du compteur à afficher en badge (les items sans compteur l'omettent).
  countKey?: keyof NavCounts;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutGrid },
      { label: "Clients", href: "/clients", icon: Users, countKey: "clients" },
      { label: "Projets", href: "/projets", icon: Layers, countKey: "projets" },
    ],
  },
  {
    label: "Facturation",
    items: [
      { label: "Devis", href: "/devis", icon: FileText, countKey: "devis" },
      { label: "Factures", href: "/factures", icon: Receipt, countKey: "factures" },
    ],
  },
  {
    label: "Pilotage",
    items: [
      { label: "Rapports", href: "/rapports", icon: BarChart3 },
      { label: "Abonnement", href: "/abonnement", icon: CreditCard },
      { label: "Paramètres", href: "/parametres", icon: Settings },
    ],
  },
];

// Jauge freemium réelle (issue #10) : "used/limit" vient de getUsage() côté
// serveur (jamais recalculé côté client). Deux états :
//  - free : barre warn/danger (rouge + copie dédiée à 100%, cf. maquette
//    « Limite atteinte.html », `.side-usage.full`) ;
//  - premium (documentsLimit === null) : pas de maquette dédiée pour cet état
//    — parti pris (à documenter) : barre pleine accent + mention "Illimité",
//    sobre et cohérent avec le reste des tokens, aucune fausse limite affichée.
function UsageGauge({ usage }: { usage: Usage }) {
  if (usage.planType === "premium" || usage.documentsLimit === null) {
    return (
      <Link
        href="/abonnement"
        title="Voir mon abonnement"
        className="mb-2.5 block rounded-md border border-line bg-surface-2 px-3 py-[11px] transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <span className="mb-[7px] flex items-baseline gap-2 text-xs font-semibold text-ink-2">
          Documents ce mois
          <b className="num ml-auto text-[11.5px] font-semibold text-accent-ink">
            Illimité
          </b>
        </span>
        <span className="block h-[5px] overflow-hidden rounded-full bg-line-soft">
          <i className="block h-full w-full rounded-full bg-accent" />
        </span>
        <small className="mt-[7px] block text-[11.5px] font-semibold text-ok-ink">
          Forfait Premium actif
        </small>
      </Link>
    );
  }

  const used = usage.documentsThisMonth;
  const limit = usage.documentsLimit;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const full = pct >= 100;

  return (
    <Link
      href="/abonnement"
      title="Voir mon abonnement"
      className={cn(
        "mb-2.5 block rounded-md border bg-surface-2 px-3 py-[11px] transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        full ? "border-danger-line" : "border-line"
      )}
    >
      <span className="mb-[7px] flex items-baseline gap-2 text-xs font-semibold text-ink-2">
        Documents ce mois
        <b className="num ml-auto text-[11.5px] font-semibold text-ink">
          {used} / {limit}
        </b>
      </span>
      <span className="block h-[5px] overflow-hidden rounded-full bg-line-soft">
        <i
          className={cn(
            "block h-full rounded-full",
            full ? "bg-danger" : "bg-warn"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <small
        className={cn(
          "mt-[7px] block text-[11.5px] font-semibold",
          full ? "text-danger-ink" : "text-accent-ink"
        )}
      >
        {full
          ? `Limite atteinte — repart le ${nextMonthFirstLabel()}`
          : "Passer en Premium →"}
      </small>
    </Link>
  );
}

export function Sidebar({
  user,
  usage,
  counts,
}: {
  user: UserProfile;
  usage: Usage;
  counts: NavCounts;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-surface print:hidden">
      {/* Brand */}
      <div className="flex h-topbar items-center gap-[11px] border-b border-line-soft px-pad">
        <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-accent text-base font-extrabold text-on-accent shadow-sm">
          F
        </div>
        <div className="text-base font-bold tracking-[-0.02em]">
          Freelance<span className="text-accent-ink">Flow</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3.5">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label ?? i} className="contents">
            {section.label && (
              <div className="px-3 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              // Compteur réel (Prisma) ; badge masqué à 0 pour ne pas surcharger.
              const badge = item.countKey ? counts[item.countKey] : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-[11px] rounded-sm px-3 py-[9px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    active
                      ? "bg-accent-soft font-semibold text-accent-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <item.icon
                    className="h-[18px] w-[18px] flex-none"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                  {item.label}
                  {badge !== undefined && badge > 0 && (
                    <span
                      className={cn(
                        "num ml-auto rounded-full px-[7px] py-px text-[11px] font-semibold",
                        active
                          ? "bg-badge-active text-accent-ink"
                          : "bg-surface-2 text-ink-2"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Pied de sidebar : jauge freemium + menu utilisateur (vrai compte) */}
      <div className="border-t border-line-soft p-3">
        <UsageGauge usage={usage} />
        <UserMenu {...user} />
      </div>
    </aside>
  );
}
