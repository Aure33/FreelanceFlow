"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileData } from "@/app/(app)/parametres/actions";
import type { TvaRegime } from "@/lib/invoicing";
import { CARD, CARD_BODY, CARD_DESC, CARD_HEAD, CARD_TITLE, CardFoot, useSaveProfile } from "./shared";

const REGIMES: { value: TvaRegime; label: string; desc: string }[] = [
  {
    value: "franchise",
    label: "Franchise en base",
    desc: "Pas de TVA facturée. Mention « TVA non applicable, art. 293 B du CGI » ajoutée.",
  },
  {
    value: "reel",
    label: "Réel simplifié",
    desc: "TVA facturée et déclarée annuellement, acomptes semestriels.",
  },
  {
    value: "normal",
    label: "Réel normal",
    desc: "TVA facturée et déclarée mensuellement (CA3).",
  },
];

// Section « Régime de TVA » (persisté : tvaRegime). Cartes radio accessibles :
// role="radiogroup"/"radio" + navigation clavier flèches (roving tabindex),
// en plus de Tab + Entrée/Espace qui fonctionnent nativement sur des <button>.
export function TvaCard({ profile }: { profile: ProfileData }) {
  const [selected, setSelected] = useState<TvaRegime>(profile.tvaRegime);
  const { save, isPending, feedback } = useSaveProfile();
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const idx = REGIMES.findIndex((r) => r.value === selected);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % REGIMES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + REGIMES.length) % REGIMES.length;
    } else {
      return;
    }
    e.preventDefault();
    setSelected(REGIMES[next].value);
    btnRefs.current[next]?.focus();
  }

  return (
    <section className={CARD} id="tva">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Régime de TVA</h2>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Détermine le calcul de la TVA et les mentions portées sur vos documents.
        </p>
        <div
          role="radiogroup"
          aria-label="Régime de TVA"
          onKeyDown={handleKeyDown}
          className="grid grid-cols-3 gap-[11px] max-[700px]:grid-cols-1"
        >
          {REGIMES.map((r, i) => {
            const active = selected === r.value;
            return (
              <button
                key={r.value}
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelected(r.value)}
                className={cn(
                  "relative rounded-md border-[1.5px] border-line bg-surface p-3.5 text-left transition-colors hover:border-accent-line",
                  active && "border-accent bg-accent-soft ring-1 ring-accent",
                )}
              >
                {active && (
                  <span className="absolute right-2.5 top-2.5 grid h-[17px] w-[17px] place-items-center rounded-full bg-accent text-on-accent">
                    <Check className="h-[11px] w-[11px]" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <b className="mb-0.5 block text-[13.5px]">{r.label}</b>
                <small
                  className={cn(
                    "block text-xs leading-[1.45] text-ink-3",
                    active && "text-accent-ink",
                  )}
                >
                  {r.desc}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      <CardFoot
        feedback={feedback}
        isPending={isPending}
        onSave={() => save({ tvaRegime: selected })}
      />
    </section>
  );
}
