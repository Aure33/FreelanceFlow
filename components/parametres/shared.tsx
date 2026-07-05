"use client";

// Constantes de style + petits utilitaires partagés par les cartes de
// Paramètres (reproduisent `.input`/`.select`/`.card`/`.card-foot`/`.field` de
// Profil.html). Regroupés ici pour éviter de dupliquer les mêmes classes dans
// chaque carte (identite/legal/tva/bank).

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  updateProfile,
  type UpdateProfileInput,
} from "@/app/(app)/parametres/actions";

export const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3";
export const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";
export const NOTE = "mt-1.5 text-[12.5px] leading-[1.5] text-ink-3";

export const CARD = "rounded-lg border border-line bg-surface shadow-sm";
export const CARD_HEAD =
  "flex items-center gap-3 border-b border-line-soft px-pad py-[18px]";
export const CARD_TITLE = "text-[15px] font-bold tracking-[-0.01em]";
export const CARD_BODY = "p-pad";
export const CARD_DESC = "-mt-1.5 mb-4 text-[13.5px] text-ink-3";
export const FROW = "mb-3.5 grid grid-cols-2 gap-3.5 max-[640px]:grid-cols-1";
export const FROW_SINGLE = "mb-3.5 grid grid-cols-1 gap-3.5";

// --- Sauvegarde d'une carte : état de transition + message bref -------------

type Feedback = { type: "ok" | "error"; text: string };

// Enregistre un sous-ensemble du profil (chaque carte n'envoie que ses propres
// champs) et affiche un accusé bref « Enregistré. » ou l'erreur serveur (celle-ci
// reste affichée, elle n'est jamais masquée automatiquement).
export function useSaveProfile() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function save(input: UpdateProfileInput) {
    clearTimeout(timeoutRef.current);
    startTransition(async () => {
      const res = await updateProfile(input);
      if ("error" in res) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setFeedback({ type: "ok", text: "Enregistré." });
        timeoutRef.current = setTimeout(() => setFeedback(null), 2500);
      }
    });
  }

  return { save, isPending, feedback };
}

// Pied de carte (`.card-foot`) : message d'état à gauche + bouton Enregistrer.
export function CardFoot({
  feedback,
  isPending,
  onSave,
  disabled,
  disabledTitle,
  label = "Enregistrer",
}: {
  feedback: Feedback | null;
  isPending: boolean;
  onSave: () => void;
  disabled?: boolean;
  disabledTitle?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-b-lg border-t border-line-soft bg-surface-2 px-pad py-[14px]">
      <span
        aria-live="polite"
        className={cn(
          "text-[13px]",
          feedback?.type === "error"
            ? "font-medium text-danger-ink"
            : feedback?.type === "ok"
              ? "font-medium text-ok-ink"
              : "text-ink-3",
        )}
      >
        {feedback?.text ?? ""}
      </span>
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="ml-auto"
        onClick={onSave}
        disabled={disabled ?? isPending}
        title={disabled ? disabledTitle : undefined}
      >
        {isPending ? "Enregistrement…" : label}
      </Button>
    </div>
  );
}
