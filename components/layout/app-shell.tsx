"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Topbar } from "./topbar";
import type { Notifications } from "@/app/(app)/notifications";

// Coquille applicative responsive (issue #96). Desktop (≥ lg) : STRICTEMENT
// identique à avant — grille sidebar 248 px + contenu. Mobile : la sidebar
// devient un TIROIR off-canvas ouvert par le bouton menu de la topbar.
// Accessibilité : aria-expanded/aria-controls sur le bouton, Échap ferme et
// rend le focus, clic sur le fond ferme, fermeture automatique au changement
// de route, focus déplacé dans le tiroir à l'ouverture, motion-reduce.
export function AppShell({
  sidebar,
  notifications,
  children,
}: {
  sidebar: React.ReactNode;
  notifications: Notifications;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Fermeture au changement de route (navigation depuis le tiroir).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Échap ferme et rend le focus au bouton menu ; focus dans le tiroir à
  // l'ouverture (navigation clavier immédiate).
  useEffect(() => {
    if (!navOpen) return;
    drawerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    // overflow-x-clip : filet de sécurité contre tout débordement décoratif
    // résiduel (clip sans créer de conteneur de scroll — sticky préservé).
    <div className="grid min-h-screen grid-cols-1 overflow-x-clip lg:grid-cols-[var(--sidebar-w)_1fr] print:block">
      {/* Fond cliquable du tiroir (mobile uniquement). */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar : off-canvas < lg, colonne de grille sinon (inchangée).
          Fermé : `invisible` (retiré du focus clavier et des lecteurs d'écran
          — un simple translate hors écran ne suffit pas) ; la transition porte
          aussi sur visibility pour conserver l'animation de sortie. */}
      <div
        id="mobile-nav"
        ref={drawerRef}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[var(--sidebar-w)] outline-none transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:visible lg:static lg:z-auto lg:w-auto lg:translate-x-0 print:hidden",
          navOpen
            ? "visible translate-x-0 shadow-xl lg:shadow-none"
            : "invisible -translate-x-full",
        )}
      >
        {sidebar}
      </div>

      <div className="flex min-w-0 flex-col">
        <Topbar
          notifications={notifications}
          menuOpen={navOpen}
          onMenuToggle={() => setNavOpen((v) => !v)}
          menuButtonRef={menuButtonRef}
        />
        <main className="mx-auto w-full max-w-content p-4 sm:p-7 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
