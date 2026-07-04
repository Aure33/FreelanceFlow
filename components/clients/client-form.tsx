"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { cn } from "@/lib/utils";
import { createClient, lookupSiret } from "@/app/(app)/clients/actions";

// Champs de saisie (reproduit `.input` / `.select` de la maquette).
const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";

// État de la vérification SIRET auprès du répertoire SIRENE.
type SiretStatus = "idle" | "checking" | "verified" | "unverified";

export function ClientForm() {
  const [siret, setSiret] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 jours");

  const [siretStatus, setSiretStatus] = useState<SiretStatus>("idle");
  const [foundName, setFoundName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Anti-course : on ignore les réponses SIRET obsolètes (frappe rapide).
  const lookupSeq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const siretDigits = siret.replace(/\D/g, "");
  const siretComplete = siretDigits.length === 14;

  // Lance la vérification SIRENE et pré-remplit Nom / Adresse s'ils sont vides.
  async function runLookup(digits: string) {
    const seq = ++lookupSeq.current;
    setSiretStatus("checking");
    const res = await lookupSiret(digits);
    if (seq !== lookupSeq.current) return; // réponse dépassée

    if (res.verified) {
      setSiretStatus("verified");
      setFoundName(res.name ?? null);
      if (res.name) setName((prev) => (prev.trim() ? prev : res.name!));
      if (res.address) setAddress((prev) => (prev.trim() ? prev : res.address!));
    } else {
      setSiretStatus("unverified");
      setFoundName(null);
    }
  }

  // Vérification en direct : dès qu'on atteint 14 chiffres, on interroge SIRENE
  // (anti-rebond 500 ms). En-deçà, on repasse à l'état neutre.
  useEffect(() => {
    clearTimeout(debounce.current);
    if (!siretComplete) {
      lookupSeq.current++;
      setSiretStatus("idle");
      setFoundName(null);
      return;
    }
    debounce.current = setTimeout(() => runLookup(siretDigits), 500);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siretDigits, siretComplete]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du client est requis.");
      return;
    }
    setLoading(true);
    setError(null);
    // createClient REDIRIGE au succès → `res` est undefined ; on ne touche à
    // l'erreur que si l'action en renvoie une (cf. bug #23).
    const res = await createClient({
      name,
      siret: siret || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      paymentTerms: paymentTerms || undefined,
    });
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <section className="rounded-lg border border-line bg-surface shadow-sm">
        {/* ===== 1 · Identification ===== */}
        <div className="border-b border-line-soft p-pad">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14.5px] font-bold tracking-[-0.01em]">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-ink font-mono">
              1
            </span>
            Identification
          </h3>

          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center gap-2.5">
              <label htmlFor="siret" className="text-[13px] font-semibold text-ink-2">
                SIRET{" "}
                <small className="font-medium text-ink-3">
                  — on pré-remplit le reste pour vous
                </small>
              </label>
              {/* Statut de vérification annoncé aux lecteurs d'écran */}
              <span className="ml-auto" aria-live="polite">
                {siretStatus === "checking" && (
                  <span className="text-[12.5px] text-ink-3">Vérification…</span>
                )}
                {siretStatus === "verified" && <Tag tone="ok">Vérifié</Tag>}
                {siretStatus === "unverified" && (
                  <span className="text-[12.5px] text-ink-3">Non reconnu</span>
                )}
              </span>
            </div>
            <div className="flex gap-[9px]">
              <input
                id="siret"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="123 456 789 00012"
                className={cn(INPUT, "flex-1 font-mono text-[13.5px]")}
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
              />
              <Button
                type="button"
                className="h-[42px] flex-none"
                disabled={!siretComplete || siretStatus === "checking"}
                onClick={() => runLookup(siretDigits)}
              >
                <Search strokeWidth={2} />
                Rechercher
              </Button>
            </div>
            {siretStatus === "verified" && (
              <div className="mt-2.5 flex items-start gap-2.5 rounded-md bg-ok-soft px-3.5 py-3 text-[13.5px] leading-[1.5] text-ok-ink">
                <Check className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} aria-hidden />
                <div>
                  {foundName ? <b className="font-bold">{foundName}</b> : "Établissement"}{" "}
                  trouvé au répertoire SIRENE — raison sociale et adresse
                  pré-remplies. Vérifiez avant d&apos;enregistrer.
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="nom" className={LABEL}>
              Nom / raison sociale
            </label>
            <input
              id="nom"
              type="text"
              placeholder="Ex. : Nord Web"
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        {/* ===== 2 · Contact ===== */}
        <div className="border-b border-line-soft p-pad">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14.5px] font-bold tracking-[-0.01em]">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-ink font-mono">
              2
            </span>
            Contact
          </h3>
          <div className="grid grid-cols-2 gap-[14px] max-[1100px]:grid-cols-1">
            <div>
              <label htmlFor="tel" className={LABEL}>
                Téléphone <small className="font-medium text-ink-3">— facultatif</small>
              </label>
              <input
                id="tel"
                type="tel"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                className={cn(INPUT, "font-mono text-[13.5px]")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email" className={LABEL}>
                E-mail de facturation
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="compta@entreprise.fr"
                className={INPUT}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ===== 3 · Adresse ===== */}
        <div className="border-b border-line-soft p-pad">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14.5px] font-bold tracking-[-0.01em]">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-ink font-mono">
              3
            </span>
            Adresse
          </h3>
          <div>
            <label htmlFor="addr" className={LABEL}>
              Adresse
            </label>
            <input
              id="addr"
              type="text"
              autoComplete="street-address"
              placeholder="14 rue Faidherbe, 59000 Lille"
              className={INPUT}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>

        {/* ===== 4 · Facturation ===== */}
        <div className="p-pad">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14.5px] font-bold tracking-[-0.01em]">
            <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-ink font-mono">
              4
            </span>
            Facturation
          </h3>
          <div>
            <label htmlFor="cond" className={LABEL}>
              Conditions de paiement
            </label>
            <div className="relative">
              <select
                id="cond"
                className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              >
                <option>À réception</option>
                <option>30 jours</option>
                <option>45 jours fin de mois</option>
                <option>60 jours</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                strokeWidth={2}
                aria-hidden
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mx-pad mb-2 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
          >
            {error}
          </div>
        )}

        {/* Pied du formulaire (`.form-foot`) */}
        <div className="flex items-center gap-2.5 rounded-b-lg border-t border-line-soft bg-surface-2 px-pad py-4">
          <span className="text-[12.5px] text-ink-3">
            Vous pourrez compléter la fiche à tout moment.
          </span>
          <span className="ml-auto" />
          <Button asChild variant="default">
            <Link href="/clients">Annuler</Link>
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            <Check strokeWidth={2} />
            {loading ? "Enregistrement…" : "Enregistrer le client"}
          </Button>
        </div>
      </section>
    </form>
  );
}
