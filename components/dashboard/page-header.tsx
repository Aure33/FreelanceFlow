"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { GatedCreateLink } from "@/components/paywall/gated-create-link";
import { PaywallModal } from "@/components/paywall/paywall-modal";
import { cn } from "@/lib/utils";
import type { Usage } from "@/app/(app)/abonnement/actions";
import { PeriodSegment } from "./period-segment";

// En-tête du tableau de bord (`.page-head`) : salutation + outils (période, Créer).
// `firstName` = vrai prénom de l'utilisateur connecté ; `dateLabel` = date du jour
// FR calculée côté serveur (sans le suffixe statique, ajouté ici). `usage` sert
// au garde-fou du bouton « Créer » (issue #10, AC #1).
export function DashboardHeader({
  firstName,
  dateLabel,
  usage,
}: {
  firstName: string;
  dateLabel: string;
  usage: Usage;
}) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);

  function closePaywall() {
    setPaywallOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="mb-6 flex items-end gap-[18px]">
      <div>
        <div className="text-2xl font-extrabold tracking-[-0.03em]">
          Bonjour {firstName}{" "}
          <span className="font-semibold text-ink-3" aria-hidden>
            👋
          </span>
        </div>
        <div className="mt-[3px] text-sm text-ink-3">
          {dateLabel} · Voici l&apos;état de votre activité
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <PeriodSegment />
        <GatedCreateLink
          usage={usage}
          href="/documents/nouveau"
          onBlocked={(trigger) => {
            triggerRef.current = trigger;
            setPaywallOpen(true);
          }}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          <Plus strokeWidth={2} />
          Créer
        </GatedCreateLink>
      </div>

      <PaywallModal open={paywallOpen} onClose={closePaywall} usage={usage} />
    </div>
  );
}
