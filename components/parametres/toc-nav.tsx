"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Sommaire latéral sticky à ancres (`.toc`) — surlignage actif au scroll
// (IntersectionObserver) ET au clic, comme Profil.html.
const SECTIONS = [
  { id: "identite", label: "Identité" },
  { id: "legal", label: "Informations légales" },
  { id: "tva", label: "Régime de TVA" },
  { id: "bank", label: "Coordonnées bancaires" },
  { id: "facturation", label: "Préférences de facturation" },
  { id: "relances", label: "Relances automatiques" },
  { id: "apparence", label: "Apparence" },
  { id: "compte", label: "Compte" },
] as const;

export function TocNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    // Scrollspy classique : la section active est la dernière dont le titre a
    // franchi la ligne de référence (sous la topbar sticky). Plus fiable qu'un
    // IntersectionObserver à rootMargin négatif, qui ne déclenche jamais pour
    // les dernières sections en bas de page (elles n'ont pas 70% de viewport
    // en dessous d'elles une fois arrivé en fin de scroll).
    const OFFSET = 112; // topbar (64px) + respiration
    let ticking = false;

    function update() {
      ticking = false;

      // Cas limite : arrivé tout en bas de la page, la dernière section (ex.
      // « Compte ») peut être trop courte pour que son titre franchisse
      // jamais la ligne de référence — on force alors la dernière section.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActive(elements[elements.length - 1].id);
        return;
      }

      let current = elements[0].id;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - OFFSET <= 0) {
          current = el.id;
        }
      }
      setActive(current);
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav
      aria-label="Sommaire des paramètres"
      className="sticky top-[calc(var(--topbar-h)+28px)] flex flex-col gap-0.5 max-[1000px]:static max-[1000px]:flex-row max-[1000px]:flex-wrap"
    >
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? "page" : undefined}
          onClick={() => setActive(s.id)}
          className={cn(
            "rounded-sm px-3 py-2 text-sm font-[550] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
            active === s.id && "bg-accent-soft font-[650] text-accent-ink hover:bg-accent-soft hover:text-accent-ink",
          )}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
