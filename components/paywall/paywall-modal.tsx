"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import type { Usage } from "@/app/(app)/abonnement/actions";
import { currentMonthLabel, nextMonthFirstLabel } from "@/lib/date-fr";

// Modale paywall (issue #10) — reproduit `#paywall` de la maquette
// « Limite atteinte.html ». Réutilisée partout où la limite mensuelle peut
// être atteinte : liste Devis/Factures, tableau de bord, accès direct à
// l'URL de l'éditeur.
//
// Accessibilité : role="dialog" + aria-modal + aria-labelledby/describedby,
// focus trap Tab/Shift+Tab, focus initial sur le CTA primaire, focus rendu à
// l'élément déclencheur à la fermeture (géré par l'appelant via onClose),
// fermeture Échap + clic sur l'overlay, prefers-reduced-motion respecté.
export function PaywallModal({
  open,
  onClose,
  usage,
}: {
  open: boolean;
  onClose: () => void;
  usage: Usage;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const titleId = "paywall-title";
  const descId = "paywall-desc";

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    ctaRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  // documentsLimit n'est théoriquement jamais null ici (le déclencheur ne
  // s'ouvre que pour le forfait "free") ; repli défensif à 5 sinon.
  const limit = usage.documentsLimit ?? 5;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] grid place-items-center bg-[oklch(0.2_0.01_75_/_0.45)] p-6 backdrop-blur-[3px] animate-in fade-in-0 duration-200 motion-reduce:animate-none"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="w-[460px] max-w-full origin-center rounded-xl border border-line bg-surface p-[30px] shadow-lg outline-none animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <div className="mb-[18px] grid h-12 w-12 place-items-center rounded-[13px] bg-warn-soft text-warn-ink">
          <TriangleAlert
            className="h-[23px] w-[23px]"
            strokeWidth={2}
            aria-hidden
          />
        </div>

        <h2
          id={titleId}
          className="mb-2 text-[19px] font-[750] leading-[1.3] tracking-[-0.02em]"
        >
          Vous avez atteint votre limite mensuelle
        </h2>
        <p id={descId} className="mb-[18px] text-sm leading-[1.55] text-ink-2">
          Le forfait Gratuit inclut{" "}
          <b className="font-[650] text-ink">{limit} documents par mois</b>.
          Votre compteur repart à zéro le{" "}
          <b className="font-[650] text-ink">{nextMonthFirstLabel()}</b> — ou
          passez en Premium pour continuer dès maintenant.
        </p>

        <div className="mb-5">
          <div className="mb-[7px] flex items-baseline gap-2 text-[13px] font-semibold text-ink-2">
            Documents émis en {currentMonthLabel()}
            <b className="num ml-auto text-[12.5px] font-semibold text-danger-ink">
              {usage.documentsThisMonth} / {limit}
            </b>
          </div>
          <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-full rounded-full bg-danger" />
          </div>
        </div>

        <ul className="mb-[22px] flex list-none flex-col gap-[9px]">
          <li className="flex gap-2.5 text-[13.5px] leading-[1.45] text-ink-2">
            <Check
              className="mt-px h-4 w-4 flex-none text-ok-ink"
              strokeWidth={2.4}
              aria-hidden
            />
            <span>
              <b className="font-[650] text-ink">Documents illimités</b>, dès
              maintenant
            </span>
          </li>
          <li className="flex gap-2.5 text-[13.5px] leading-[1.45] text-ink-2">
            <Check
              className="mt-px h-4 w-4 flex-none text-ok-ink"
              strokeWidth={2.4}
              aria-hidden
            />
            <span>
              <b className="font-[650] text-ink">Relances automatiques</b> des
              factures échues
            </span>
          </li>
          <li className="flex gap-2.5 text-[13.5px] leading-[1.45] text-ink-2">
            <Check
              className="mt-px h-4 w-4 flex-none text-ok-ink"
              strokeWidth={2.4}
              aria-hidden
            />
            <span>
              PDF <b className="font-[650] text-ink">sans filigrane</b>, avec
              votre logo
            </span>
          </li>
        </ul>

        <div className="flex flex-col gap-[9px]">
          <Link
            ref={ctaRef}
            href="/abonnement"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:border-accent-hover hover:bg-accent-hover"
          >
            Passer en Premium — 15 €/mois
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-[9px] text-[13px] font-semibold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Attendre le {nextMonthFirstLabel()}
          </button>
        </div>
        <div className="mt-3 text-center text-xs text-ink-3">
          Sans engagement · activation immédiate · annulable en 2 clics
        </div>
      </div>
    </div>
  );
}
