"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProfileData } from "@/app/(app)/parametres/actions";
import {
  CARD,
  CARD_BODY,
  CARD_DESC,
  CARD_HEAD,
  CARD_TITLE,
  CardFoot,
  FROW_SINGLE,
  INPUT,
  LABEL,
  NOTE,
  useSaveProfile,
} from "./shared";

function formatSiretDisplay(digits: string): string {
  const groups = digits.match(/.{1,3}/g) ?? [];
  return groups.join(" ");
}

// Section « Informations légales » (persisté : siret uniquement — pas de
// forme juridique, TVA intracommunautaire ni code APE, hors scope #12).
export function LegalCard({ profile }: { profile: ProfileData }) {
  const [siret, setSiret] = useState(
    profile.siret ? formatSiretDisplay(profile.siret) : "",
  );
  const { save, isPending, feedback } = useSaveProfile();

  const digits = siret.replace(/\D/g, "");
  const complete = digits.length === 14;
  const tooLong = digits.length > 14;

  return (
    <section className={CARD} id="legal">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Informations légales</h2>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Obligatoires sur chaque document émis.
        </p>
        <div className={FROW_SINGLE}>
          <div>
            <label htmlFor="legal-siret" className={LABEL}>
              SIRET
            </label>
            <input
              id="legal-siret"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="123 456 789 00012"
              className={cn(INPUT, "font-mono text-[13.5px]")}
              value={siret}
              onChange={(e) => setSiret(formatSiretDisplay(e.target.value.replace(/\D/g, "")))}
            />
            <div
              className={cn(
                NOTE,
                tooLong && "text-danger-ink",
                complete && "text-ok-ink",
              )}
            >
              {digits.length} / 14 chiffres
              {tooLong ? " — trop long" : complete ? " — format correct" : ""}
            </div>
          </div>
        </div>
      </div>
      <CardFoot
        feedback={feedback}
        isPending={isPending}
        onSave={() => save({ siret: digits })}
      />
    </section>
  );
}
