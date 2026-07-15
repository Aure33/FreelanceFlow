"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Coquille de modale accessible réutilisable (issue #58) — même contrat a11y
// que NewProjectModal/PaywallModal (role=dialog, aria-modal, focus trap, Échap,
// clic-extérieur, restauration du focus, prefers-reduced-motion), extrait pour
// ne pas dupliquer la logique dans chaque nouvelle modale. Les modales
// existantes ne sont pas migrées (aucun risque de régression) ; les prochaines
// utiliseront ce shell.
export function ModalShell({
  open,
  onClose,
  title,
  titleId,
  children,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  children: React.ReactNode;
  // Élément à focus à l'ouverture (1er champ du formulaire en général).
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap + Échap + restauration du focus sur l'élément déclencheur.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? modalRef.current)?.focus();

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
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  // PORTAL vers <body> (#63) : un ancêtre avec `transform`/`backdrop-filter`
  // (ex. la topbar en backdrop-blur) devient le containing block des
  // descendants `position: fixed` — la modale se calerait dessus au lieu du
  // viewport. Rendue seulement à l'ouverture (côté client), document existe.
  return createPortal(
    <>
      {/* Fond assombri — clic pour fermer */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[oklch(0.25_0.01_75_/_0.32)] animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        aria-hidden
      />

      {/* Modale */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg outline-none animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 border-b border-line-soft px-6 pb-4 pt-5">
          <h2 id={titleId} className="text-[17px] font-[750] tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {children}
      </div>
    </>,
    document.body,
  );
}
