"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { computeInitials } from "@/lib/auth/initials";
import { cn } from "@/lib/utils";
import type { ProfileData } from "@/app/(app)/parametres/actions";
import {
  CARD,
  CARD_BODY,
  CARD_DESC,
  CARD_HEAD,
  CARD_TITLE,
  CardFoot,
  FROW,
  FROW_SINGLE,
  INPUT,
  LABEL,
  useSaveProfile,
} from "./shared";

// Section « Identité » (persisté : name, activity, phone, address).
export function IdentityCard({ profile }: { profile: ProfileData }) {
  const [name, setName] = useState(profile.name ?? "");
  const [activity, setActivity] = useState(profile.activity ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const { save, isPending, feedback } = useSaveProfile();

  const initials = computeInitials(name || profile.email || "U");

  return (
    <section className={CARD} id="identite">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Identité</h2>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Ces informations apparaissent en en-tête de vos devis et factures.
        </p>

        <div className="mb-[18px] flex items-center gap-[18px]">
          <div
            className="grid h-16 w-16 flex-none place-items-center rounded-full text-[22px] font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.55 0.13 264), oklch(0.5 0.12 295))",
            }}
            aria-hidden
          >
            {initials}
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Bientôt disponible"
            className="flex flex-1 cursor-not-allowed items-center gap-[13px] rounded-md border-[1.5px] border-dashed border-line px-[18px] py-3.5 text-left text-[13.5px] text-ink-3 opacity-70"
          >
            <ImagePlus className="h-[22px] w-[22px] flex-none" strokeWidth={1.8} aria-hidden />
            <div>
              <b className="block text-[13.5px] font-semibold">Ajouter votre logo</b>
              <small className="text-xs">
                PNG ou SVG · fond transparent recommandé · max 2 Mo
              </small>
            </div>
          </button>
        </div>

        <div className={FROW_SINGLE}>
          <div>
            <label htmlFor="id-name" className={LABEL}>
              Prénom et nom
            </label>
            <input
              id="id-name"
              type="text"
              autoComplete="name"
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className={FROW}>
          <div>
            <label htmlFor="id-activity" className={LABEL}>
              Activité
            </label>
            <input
              id="id-activity"
              type="text"
              className={INPUT}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="id-phone" className={LABEL}>
              Téléphone
            </label>
            <input
              id="id-phone"
              type="tel"
              autoComplete="tel"
              className={cn(INPUT, "font-mono text-[13.5px]")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className={FROW_SINGLE}>
          <div>
            <label htmlFor="id-address" className={LABEL}>
              Adresse professionnelle
            </label>
            <input
              id="id-address"
              type="text"
              autoComplete="street-address"
              className={INPUT}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>
      </div>
      <CardFoot
        feedback={feedback}
        isPending={isPending}
        onSave={() => save({ name, activity, phone, address })}
      />
    </section>
  );
}
