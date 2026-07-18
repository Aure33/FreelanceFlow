"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/dashboard/tag";
import {
  updateReminderSettings,
  type ReminderSettingsData,
} from "@/app/(app)/parametres/actions";
import { CARD, CARD_BODY, CARD_DESC, CARD_HEAD, CARD_TITLE, CardFoot, LABEL } from "./shared";

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

// Section « Relances automatiques » — RÉELLE depuis #84 : les réglages sont
// persistés (users.reminders_enabled / reminder_*) et exécutés par le cron
// quotidien (app/api/cron/relances). Un compte free peut sauvegarder sa
// configuration (copie existante : « s'activera dès votre passage en
// Premium ») — le cron ne traite que les comptes premium.
export function RemindersCard({
  planType,
  initial,
}: {
  planType: "free" | "premium";
  initial: ReminderSettingsData;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [first, setFirst] = useState(initial.firstDays);
  const [second, setSecond] = useState(initial.secondDays);
  const [last, setLast] = useState(initial.finalDays);
  const [tone, setTone] = useState<Tone>(initial.tone);
  const switchId = useId();

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function save() {
    clearTimeout(timeoutRef.current);
    startTransition(async () => {
      const res = await updateReminderSettings({
        enabled,
        firstDays: first,
        secondDays: second,
        finalDays: last,
        tone,
      });
      if ("error" in res) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setFeedback({ type: "ok", text: "Enregistré." });
        timeoutRef.current = setTimeout(() => setFeedback(null), 2500);
      }
    });
  }

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
              S&apos;applique aux factures dont l&apos;échéance est dépassée,
              selon les paliers ci-dessous. Une vérification par jour.
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
                  onChange={(e) => setFirst(Number(e.target.value))}
                  disabled={!enabled}
                >
                  <option value={3}>J+3 après échéance</option>
                  <option value={7}>J+7 après échéance</option>
                  <option value={10}>J+10 après échéance</option>
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
                onChange={(e) => setSecond(Number(e.target.value))}
                disabled={!enabled}
              >
                <option value={10}>J+10</option>
                <option value={15}>J+15</option>
                <option value={21}>J+21</option>
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
                onChange={(e) => setLast(Number(e.target.value))}
                disabled={!enabled}
              >
                <option value={21}>J+21</option>
                <option value={30}>J+30</option>
                <option value={45}>J+45</option>
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
              Fonctionnalité incluse dans votre forfait Premium. Les factures
              échues sont relancées automatiquement par e-mail, une
              vérification par jour, selon ce calendrier.
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
      <CardFoot feedback={feedback} isPending={isPending} onSave={save} />
    </section>
  );
}
