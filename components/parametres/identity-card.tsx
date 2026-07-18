"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { computeInitials } from "@/lib/auth/initials";
import { cn } from "@/lib/utils";
import type { ProfileData } from "@/app/(app)/parametres/actions";
import { deleteLogo, uploadLogo } from "@/app/(app)/parametres/logo-actions";
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
  const isPremium = profile.planType === "premium";

  // Logo d'entreprise (#87) : upload/remplacement/suppression dans le bucket
  // privé `logos` (RLS par utilisateur), affiché ensuite sur l'en-tête A4.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoPending, startLogoTransition] = useTransition();
  const [logoError, setLogoError] = useState<string | null>(null);
  // router.refresh() ne suffit pas à invalider ce composant client : on garde
  // l'URL signée localement après upload (la page serveur relit la vraie au
  // prochain rendu).
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);

  function onLogoPicked(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    const formData = new FormData();
    formData.set("logo", file);
    startLogoTransition(async () => {
      const res = await uploadLogo(formData);
      if ("error" in res) {
        setLogoError(res.error);
        return;
      }
      // Aperçu immédiat sans attendre une nouvelle URL signée du serveur.
      setLogoUrl(URL.createObjectURL(file));
    });
  }

  function onLogoDelete() {
    setLogoError(null);
    startLogoTransition(async () => {
      const res = await deleteLogo();
      if ("error" in res) {
        setLogoError(res.error);
        return;
      }
      setLogoUrl(null);
    });
  }

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
          {logoUrl ? (
            // URL signée Supabase (ou blob local juste après upload) : pas
            // d'optimisation next/image possible sur une URL expirante.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo de votre entreprise"
              className="h-16 w-16 flex-none rounded-md border border-line bg-surface object-contain p-1"
            />
          ) : (
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
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg"
            className="sr-only"
            aria-label="Choisir un fichier de logo"
            onChange={(e) => {
              onLogoPicked(e.target.files?.[0]);
              e.target.value = ""; // permet de re-choisir le même fichier
            }}
          />
          <button
            type="button"
            disabled={logoPending || !isPremium}
            onClick={() => fileInputRef.current?.click()}
            title={
              isPremium
                ? undefined
                : "Le logo personnalisé sur les documents est réservé au forfait Premium."
            }
            className="flex flex-1 items-center gap-[13px] rounded-md border-[1.5px] border-dashed border-line px-[18px] py-3.5 text-left text-[13.5px] text-ink-2 transition-colors enabled:cursor-pointer enabled:hover:border-accent enabled:hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ImagePlus className="h-[22px] w-[22px] flex-none" strokeWidth={1.8} aria-hidden />
            <div>
              <b className="block text-[13.5px] font-semibold">
                {logoPending
                  ? "Envoi en cours…"
                  : logoUrl
                    ? "Remplacer votre logo"
                    : "Ajouter votre logo"}
              </b>
              <small className="text-xs text-ink-3">
                {isPremium
                  ? "PNG ou SVG · fond transparent recommandé · max 2 Mo · affiché sur vos devis et factures"
                  : "Réservé au forfait Premium — affiché sur vos devis et factures"}
              </small>
            </div>
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={logoPending}
              onClick={onLogoDelete}
              aria-label="Supprimer le logo"
              title="Supprimer le logo"
              className="grid h-9 w-9 flex-none place-items-center rounded-md border border-line text-ink-3 transition-colors hover:border-danger hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        {logoError ? (
          <p role="alert" className="-mt-2 mb-4 text-[13px] font-medium text-danger-ink">
            {logoError}
          </p>
        ) : null}

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
