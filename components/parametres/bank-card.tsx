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
  useSaveProfile,
} from "./shared";

// Section « Coordonnées bancaires » (persisté : iban, bic — pas de champ
// « Titulaire », non modélisé).
export function BankCard({ profile }: { profile: ProfileData }) {
  const [iban, setIban] = useState(profile.iban ?? "");
  const [bic, setBic] = useState(profile.bic ?? "");
  const { save, isPending, feedback } = useSaveProfile();

  return (
    <section className={CARD} id="bank">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Coordonnées bancaires</h2>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Affichées dans le bloc « Règlement » de vos factures.
        </p>
        <div className={FROW_SINGLE}>
          <div>
            <label htmlFor="bank-iban" className={LABEL}>
              IBAN
            </label>
            <input
              id="bank-iban"
              type="text"
              autoComplete="off"
              placeholder="FR76 3000 4028 3798 7654 3210 943"
              className={cn(INPUT, "font-mono text-[13.5px]")}
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </div>
        </div>
        <div className={FROW_SINGLE}>
          <div>
            <label htmlFor="bank-bic" className={LABEL}>
              BIC
            </label>
            <input
              id="bank-bic"
              type="text"
              autoComplete="off"
              placeholder="BNPAFRPPXXX"
              className={cn(INPUT, "font-mono text-[13.5px]")}
              value={bic}
              onChange={(e) => setBic(e.target.value)}
            />
          </div>
        </div>
      </div>
      <CardFoot
        feedback={feedback}
        isPending={isPending}
        onSave={() => save({ iban, bic })}
      />
    </section>
  );
}
