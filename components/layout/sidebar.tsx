"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
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

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

// Compteurs mockés (maquette) — à remplacer par les données Prisma.
const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: LayoutGrid },
      { label: "Clients", href: "/clients", icon: Users, badge: 24 },
      { label: "Projets", href: "/projets", icon: Layers, badge: 8 },
    ],
  },
  {
    label: "Facturation",
    items: [
      { label: "Devis", href: "/devis", icon: FileText, badge: 5 },
      { label: "Factures", href: "/factures", icon: Receipt, badge: 12 },
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

function UsageGauge({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <Link
      href="/abonnement"
      title="Voir mon abonnement"
      className="mb-2.5 block rounded-md border border-line bg-surface-2 px-3 py-[11px] transition-colors hover:border-accent"
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
            pct >= 100 ? "bg-danger" : "bg-warn"
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <small className="mt-[7px] block text-[11.5px] font-semibold text-accent-ink">
        Passer en Premium →
      </small>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-surface">
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-[11px] rounded-sm px-3 py-[9px] text-sm font-medium transition-colors",
                    active
                      ? "bg-accent-soft font-semibold text-accent-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] flex-none" strokeWidth={1.9} />
                  {item.label}
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "num ml-auto rounded-full px-[7px] py-px text-[11px] font-semibold",
                        active
                          ? "bg-badge-active text-accent-ink"
                          : "bg-surface-2 text-ink-2"
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Pied de sidebar : jauge freemium + utilisateur */}
      <div className="border-t border-line-soft p-3">
        <UsageGauge used={4} limit={5} />
        <button
          type="button"
          className="flex w-full items-center gap-[11px] rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
        >
          <div
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[13px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.55 0.13 264), oklch(0.5 0.12 295))",
            }}
          >
            CL
          </div>
          <div className="min-w-0">
            <b className="block text-[13.5px] font-semibold leading-tight">
              Camille Laurent
            </b>
            <small className="text-xs text-ink-3">Studio · Régime réel</small>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 text-ink-3" strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
