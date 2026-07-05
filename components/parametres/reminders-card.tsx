"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { CARD, CARD_BODY, CARD_DESC, CARD_HEAD, CARD_TITLE, LABEL } from "./shared";

type Tone = "courtois" | "neutre" | "ferme";

// Textes EXACTS de l'aperçu, repris du script de Profil.html (objet `tones`).
const TONES: Record<Tone, string> = {
  courtois:
    "« Sauf oubli de votre part, la facture FAC-2026-031 est arrivée à échéance. Je me permets de vous la rappeler en toute simplicité. »",
  neutre:
    "« La facture FAC-2026-031 est échue depuis 7 jours. Merci de procéder à son règlement à réception de ce message. »",
  ferme:
    "« Malgré nos précédents échanges, la facture FAC-2026-031 demeure impayée. À défaut de règlement sous 8 jours, les pénalités de retard prévues à l'article L441-10 seront appliquées. »",
};

const TONE_LABELS: Record<Tone, string> = {
  courtois: "Courtois",
  neutre: "Neutre",
  ferme: "Ferme",
};

const SELECT =
  "h-[42px] w-full cursor-pointer appearance-none rounded-md border border-line bg-surface pl-[13px] pr-[38px] text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";

// Section « Relances automatiques » (Premium) — interactivité 100 % locale,
// AUCUNE persistance réelle : ce projet n'implémente aucune automatisation
// d'envoi de relance côté serveur. Le bouton Enregistrer reste désactivé pour
// ne jamais laisser croire que la configuration est sauvegardée.
export function RemindersCard({ planType }: { planType: "free" | "premium" }) {
  const [enabled, setEnabled] = useState(true);
  const [first, setFirst] = useState("J+7 après échéance");
  const [second, setSecond] = useState("J+15");
  const [last, setLast] = useState("J+30");
  const [tone, setTone] = useState<Tone>("courtois");
  const switchId = useId();

  const isPremium = planType === "premium";

  return (
    <section className={CARD} id="relances">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Relances automatiques</h2>
        <span className="ml-auto" />
        <Tag tone="accent">Premium</Tag>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Freelance Flow relance vos factures échues à votre place, selon le
          calendrier et le ton que vous choisissez.
        </p>

        <div className="mb-4 flex items-center gap-3.5 rounded-md border border-line px-4 py-3.5">
          <div className="flex-1">
            <b className="block text-sm font-semibold">
              Activer les relances automatiques
            </b>
            <small className="text-[13px] text-ink-3">
              S&apos;applique aux factures dont l&apos;échéance est dépassée.
              Vous gardez la main : chaque envoi est notifié.
            </small>
          </div>
          <label
            htmlFor={switchId}
            className="relative inline-flex h-[26px] w-11 flex-none cursor-pointer items-center"
          >
            <input
              id={switchId}
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-label="Activer les relances automatiques"
              className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
            />
            <span className="pointer-events-none absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-[3px] peer-focus-visible:ring-accent-soft" />
            <span className="pointer-events-none absolute left-[3px] h-5 w-5 rounded-full bg-on-accent shadow-sm transition-transform peer-checked:translate-x-[18px]" />
          </label>
        </div>

        <div className={cn("transition-opacity", !enabled && "pointer-events-none opacity-45")}>
          <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-[700px]:grid-cols-1">
            <div>
              <label htmlFor="rel-first" className={LABEL}>
                1ʳᵉ relance
              </label>
              <div className="relative">
                <select
                  id="rel-first"
                  className={SELECT}
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  disabled={!enabled}
                >
                  <option>J+3 après échéance</option>
                  <option>J+7 après échéance</option>
                  <option>J+10 après échéance</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="rel-second" className={LABEL}>
                2ᵉ relance
              </label>
              <select
                id="rel-second"
                className={SELECT}
                value={second}
                onChange={(e) => setSecond(e.target.value)}
                disabled={!enabled}
              >
                <option>J+10</option>
                <option>J+15</option>
                <option>J+21</option>
              </select>
            </div>
            <div>
              <label htmlFor="rel-last" className={LABEL}>
                Dernière relance
              </label>
              <select
                id="rel-last"
                className={SELECT}
                value={last}
                onChange={(e) => setLast(e.target.value)}
                disabled={!enabled}
              >
                <option>J+21</option>
                <option>J+30</option>
                <option>J+45</option>
              </select>
            </div>
          </div>

          <div className="mb-3.5 flex flex-wrap items-center gap-3.5">
            <span className="text-[13px] font-semibold text-ink-2">
              Ton des messages
            </span>
            <div
              role="group"
              aria-label="Ton des messages de relance"
              className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
            >
              {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={tone === t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors",
                    tone === t && "bg-surface text-ink shadow-sm",
                  )}
                >
                  {TONE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-md border border-line-soft bg-surface-2 px-4 py-3.5 text-[13px] leading-[1.6] text-ink-2"
            aria-live="polite"
          >
            <span className="mb-1 block font-mono text-xs text-ink-3">
              Objet : Rappel — facture FAC-2026-031
            </span>
            {TONES[tone]}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-[11px] rounded-md bg-accent-soft px-4 py-3.5 text-[13.5px] leading-[1.55] text-accent-ink">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2} aria-hidden />
          {isPremium ? (
            <span>
              Fonctionnalité incluse dans votre forfait Premium. La
              configuration ci-dessus est une démonstration : aucune relance
              n&apos;est envoyée automatiquement dans ce projet.
            </span>
          ) : (
            <span>
              Fonctionnalité réservée au forfait Premium. Votre configuration
              est conservée et s&apos;activera dès votre{" "}
              <Link href="/abonnement" className="font-bold underline">
                passage en Premium
              </Link>
              .
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-b-lg border-t border-line-soft bg-surface-2 px-pad py-[14px]">
        <span className="text-[13px] text-ink-3">Configuration jamais activée</span>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled
          title="Les relances automatiques ne sont pas encore persistées côté serveur : aucune automatisation d'envoi n'existe dans ce projet."
        >
          Enregistrer
        </Button>
      </div>
    </section>
  );
}
