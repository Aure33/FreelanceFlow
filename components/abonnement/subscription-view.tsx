"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Check, FileText, Lock, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { cn } from "@/lib/utils";
import { createCheckoutSession, type Usage } from "@/app/(app)/abonnement/actions";
import { memberSinceLabel, nextMonthFirstLabel } from "@/lib/date-fr";

type Cycle = "mois" | "an";

const li =
  "flex gap-2.5 text-[13.5px] leading-[1.45]";
const liIcon = "mt-px h-4 w-4 flex-none";

// Page Abonnement (issue #10, AC #4 ; paiement réel #82). Reçoit `usage`
// chargé côté serveur (getUsage()) ; le toggle mensuel/annuel est un state
// local qui détermine le prix Stripe envoyé à createCheckoutSession(). Le
// forfait n'est JAMAIS accordé ici : Stripe héberge le formulaire de carte,
// et seul le webhook (lib/premium.ts) accorde le Premium après paiement
// confirmé — cette page ne fait qu'ouvrir la session Checkout.
export function SubscriptionView({ usage }: { usage: Usage }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutState = searchParams.get("checkout"); // "success" | "cancel" | null
  const [cycle, setCycle] = useState<Cycle>("mois");
  const [isPending, startTransition] = useTransition();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isPremium = usage.planType === "premium";
  const limit = usage.documentsLimit; // null si premium
  const used = usage.documentsThisMonth;
  const pctDocs = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  // La maquette affiche le bloc d'avertissement dès 4/5 ET 5/5 (deux textes
  // différents) : seuil générique = "limite - 1".
  const nearOrAtLimit = !isPremium && limit !== null && used >= limit - 1;
  const atLimit = !isPremium && limit !== null && used >= limit;
  // Jauge Clients : illustration proportionnelle, jamais bloquante (aucune
  // limite réelle sur ce compteur, quel que soit le forfait) — parti pris
  // décoratif faute de palier de référence dans les données.
  const clientsPct = Math.min(100, usage.clientsCount);

  // Le webhook Stripe (asynchrone) peut arriver quelques centaines de ms
  // après la redirection de Checkout : si l'utilisateur revient marqué
  // « success » mais que `usage` (chargé juste avant ce rendu) montre encore
  // « free », un unique refresh différé laisse le temps au webhook d'arriver.
  useEffect(() => {
    if (checkoutState !== "success" || isPremium) return;
    const t = setTimeout(() => router.refresh(), 2000);
    return () => clearTimeout(t);
  }, [checkoutState, isPremium, router]);

  function handleUpgrade() {
    setCheckoutError(null);
    startTransition(async () => {
      const res = await createCheckoutSession(cycle);
      if ("error" in res) {
        setCheckoutError(res.error);
        return;
      }
      // Redirection RÉELLE vers Stripe (hors origine) — pas de router.push,
      // qui ne gère que la navigation interne à l'app.
      window.location.href = res.url;
    });
  }

  const priceDisplay = cycle === "an" ? "12 €" : "15 €";
  const priceNote =
    cycle === "an"
      ? "facturé 144 € par an — 2 mois offerts"
      : "sans engagement, annulable à tout moment";

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="mb-[22px] flex items-center gap-[18px]">
        <div>
          <div className="text-2xl font-extrabold tracking-[-0.03em]">
            Abonnement
          </div>
          <div className="mt-[3px] text-sm text-ink-3">
            Gérez votre forfait et suivez votre consommation.
          </div>
        </div>
      </div>

      {/* Retour de Stripe Checkout (#82) */}
      {checkoutState === "success" && (
        <div
          role="status"
          className="mb-gap flex items-center gap-2.5 rounded-md bg-ok-soft px-[18px] py-[13px] text-[13.5px] font-medium text-ok-ink"
        >
          <Check className="h-[18px] w-[18px] flex-none" strokeWidth={2.2} aria-hidden />
          {isPremium
            ? "Paiement confirmé — vous êtes en Premium."
            : "Paiement reçu — activation de votre Premium en cours…"}
        </div>
      )}
      {checkoutState === "cancel" && (
        <div
          role="status"
          className="mb-gap flex items-center gap-2.5 rounded-md bg-surface-2 px-[18px] py-[13px] text-[13.5px] font-medium text-ink-2"
        >
          Paiement annulé — aucun montant n&apos;a été prélevé.
        </div>
      )}
      {checkoutError && (
        <div
          role="alert"
          className="mb-gap flex items-center gap-2.5 rounded-md bg-danger-soft px-[18px] py-[13px] text-[13.5px] font-medium text-danger-ink"
        >
          <TriangleAlert className="h-[18px] w-[18px] flex-none" strokeWidth={2.2} aria-hidden />
          {checkoutError}
        </div>
      )}

      {/* ===== Forfait actuel ===== */}
      <section className="rounded-lg border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-4 border-b border-line-soft p-pad">
          <div className="grid h-[46px] w-[46px] flex-none place-items-center rounded-xl bg-surface-2 text-ink-2">
            <Box className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2.5 text-[16.5px] font-[750] tracking-[-0.015em]">
              Forfait {isPremium ? "Premium" : "Gratuit"}
              <Tag tone="neutral">Plan actuel</Tag>
            </div>
            <small className="text-[13px] text-ink-3">
              Membre depuis {memberSinceLabel(usage.memberSince)} · aucun
              engagement
            </small>
          </div>
          <div className="ml-auto text-right">
            <span className="num block text-xl font-semibold tracking-[-0.01em]">
              {isPremium ? "15 €" : "0 €"}
            </span>
            <small className="block text-[12.5px] text-ink-3">par mois</small>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-[26px] p-pad max-[1000px]:grid-cols-1">
          {/* Documents */}
          <div>
            <div className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-ink-2">
              Documents ce mois-ci
              <span className="num ml-auto text-[12.5px] text-ink-3">
                {isPremium ? (
                  <b className="font-semibold text-ink">Illimité</b>
                ) : (
                  <>
                    <b className="font-semibold text-ink">{used}</b> / {limit}
                  </>
                )}
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  "h-full rounded-full",
                  !isPremium && nearOrAtLimit ? "bg-warn" : "bg-accent",
                )}
                style={{ width: isPremium ? "100%" : `${pctDocs}%` }}
              />
            </div>
            <div
              className={cn(
                "mt-[7px] text-xs text-ink-3",
                nearOrAtLimit && "font-semibold text-warn-ink",
              )}
            >
              {isPremium
                ? "Aucune limite sur le plan Premium"
                : atLimit
                  ? `Limite atteinte — repart le ${nextMonthFirstLabel()}`
                  : nearOrAtLimit
                    ? `Plus qu'${(limit as number) - used} document avant le ${nextMonthFirstLabel()}`
                    : "Aucune limite atteinte ce mois-ci"}
            </div>
          </div>

          {/* Clients */}
          <div>
            <div className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-ink-2">
              Clients
              <span className="num ml-auto text-[12.5px] text-ink-3">
                <b className="font-semibold text-ink">{usage.clientsCount}</b>{" "}
                / illimités
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${clientsPct}%` }}
              />
            </div>
            <div className="mt-[7px] text-xs text-ink-3">
              Aucune limite sur le plan {isPremium ? "Premium" : "Gratuit"}
            </div>
          </div>

          {/* Relances */}
          <div>
            <div className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-ink-2">
              Relances
              <span className="num ml-auto text-[12.5px] text-ink-3">
                <b className="font-semibold text-ink">
                  {isPremium ? "automatiques" : "manuelles"}
                </b>
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: isPremium ? "100%" : "0%" }}
              />
            </div>
            <div className="mt-[7px] text-xs text-ink-3">
              {isPremium
                ? "Relances automatiques des factures échues"
                : "Relances automatiques réservées au Premium"}
            </div>
          </div>
        </div>

        {nearOrAtLimit && limit !== null && (
          <div className="mx-pad mb-pad flex items-start gap-[11px] rounded-md bg-warn-soft px-4 py-3.5 text-[13.5px] leading-[1.55] text-warn-ink">
            <TriangleAlert
              className="mt-px h-[17px] w-[17px] flex-none"
              strokeWidth={2.2}
              aria-hidden
            />
            <div>
              Vous avez émis{" "}
              <b className="font-bold">
                {used} documents sur {limit}
              </b>{" "}
              ce mois-ci.{" "}
              {atLimit
                ? "La création est bloquée jusqu'au mois prochain — ou passez en Premium pour des documents illimités."
                : "Au-delà, la création sera bloquée jusqu'au mois prochain — ou passez en Premium pour des documents illimités."}
            </div>
          </div>
        )}
      </section>

      {/* ===== Comparatif ===== */}
      <div className="mb-4 mt-[34px] flex items-center gap-4">
        <h2 className="text-[17px] font-[750] tracking-[-0.02em]">
          Choisir un forfait
        </h2>
        <div
          role="group"
          aria-label="Cycle de facturation"
          className="ml-auto inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
        >
          <button
            type="button"
            aria-pressed={cycle === "mois"}
            onClick={() => setCycle("mois")}
            className={cn(
              "rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              cycle === "mois" ? "bg-surface text-ink shadow-sm" : "text-ink-2",
            )}
          >
            Mensuel
          </button>
          <button
            type="button"
            aria-pressed={cycle === "an"}
            onClick={() => setCycle("an")}
            className={cn(
              "rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              cycle === "an" ? "bg-surface text-ink shadow-sm" : "text-ink-2",
            )}
          >
            Annuel{" "}
            <span className="font-mono text-[11px] opacity-75">−20 %</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 items-stretch gap-gap max-[1000px]:grid-cols-1">
        {/* Gratuit */}
        <article className="flex flex-col rounded-lg border border-line bg-surface p-[26px] shadow-sm">
          <h3 className="text-[15.5px] font-[750] tracking-[-0.015em]">
            Gratuit
          </h3>
          <div className="mt-0.5 text-[13px] text-ink-3">
            Pour démarrer et tester en conditions réelles.
          </div>
          <div className="mb-1 mt-[18px] flex items-baseline gap-1.5">
            <span className="num text-[32px] font-semibold tracking-[-0.02em]">
              0 €
            </span>
            <small className="text-[13px] text-ink-3">/ mois</small>
          </div>
          <div className="min-h-[18px] text-xs text-ink-3">pour toujours</div>

          <ul className="my-5 flex list-none flex-col gap-2.5">
            <li className={cn(li, "text-ink-2")}>
              <Check
                className={cn(liIcon, "text-ok-ink")}
                strokeWidth={2.4}
                aria-hidden
              />
              <span>
                <b className="font-[650] text-ink">5 documents</b> (devis +
                factures) par mois
              </span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check
                className={cn(liIcon, "text-ok-ink")}
                strokeWidth={2.4}
                aria-hidden
              />
              <span>Clients et projets illimités</span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check
                className={cn(liIcon, "text-ok-ink")}
                strokeWidth={2.4}
                aria-hidden
              />
              <span>Calcul TVA et mentions légales automatiques</span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check
                className={cn(liIcon, "text-ok-ink")}
                strokeWidth={2.4}
                aria-hidden
              />
              <span>
                Export PDF <b className="font-[650] text-ink">avec filigrane</b>{" "}
                Freelance Flow
              </span>
            </li>
            <li className={cn(li, "text-ink-3")}>
              <X className={cn(liIcon, "text-line")} strokeWidth={2.4} aria-hidden />
              <span>Relances automatiques</span>
            </li>
            <li className={cn(li, "text-ink-3")}>
              <X className={cn(liIcon, "text-line")} strokeWidth={2.4} aria-hidden />
              <span>Logo personnalisé sur les documents</span>
            </li>
            <li className={cn(li, "text-ink-3")}>
              <X className={cn(liIcon, "text-line")} strokeWidth={2.4} aria-hidden />
              <span>Statistiques d&apos;activité avancées</span>
            </li>
          </ul>

          <Button
            type="button"
            variant="default"
            disabled
            className="mt-auto h-11 justify-center"
          >
            {isPremium ? "Non disponible" : "Votre plan actuel"}
          </Button>
        </article>

        {/* Premium */}
        <article className="relative flex flex-col rounded-lg border border-accent bg-surface p-[26px] shadow-md ring-1 ring-accent">
          <span className="absolute -top-[11px] left-6 rounded-full bg-accent px-[11px] py-[3px] text-[11.5px] font-bold tracking-[0.04em] text-on-accent">
            Recommandé
          </span>
          <h3 className="text-[15.5px] font-[750] tracking-[-0.015em]">
            Premium
          </h3>
          <div className="mt-0.5 text-[13px] text-ink-3">
            Pour facturer sans limite et être payé plus vite.
          </div>
          <div className="mb-1 mt-[18px] flex items-baseline gap-1.5">
            <span className="num text-[32px] font-semibold tracking-[-0.02em]">
              {priceDisplay}
            </span>
            <small className="text-[13px] text-ink-3">/ mois</small>
          </div>
          <div className="min-h-[18px] text-xs text-ink-3">{priceNote}</div>

          <ul className="my-5 flex list-none flex-col gap-2.5">
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>
                <b className="font-[650] text-ink">Documents illimités</b>
              </span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>Tout le plan Gratuit, sans filigrane</span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>
                <b className="font-[650] text-ink">Relances automatiques</b>{" "}
                des factures échues
              </span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>Logo et identité sur vos documents</span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>Statistiques avancées et évolution du CA</span>
            </li>
            <li className={cn(li, "text-ink-2")}>
              <Check className={cn(liIcon, "text-ok-ink")} strokeWidth={2.4} aria-hidden />
              <span>Support prioritaire sous 24 h</span>
            </li>
          </ul>

          {isPremium ? (
            <Button
              type="button"
              variant="default"
              disabled
              className="mt-auto h-11 justify-center"
            >
              Votre plan actuel
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleUpgrade}
              disabled={isPending}
              className="mt-auto h-11 justify-center"
            >
              {isPending ? "Activation…" : "Passer en Premium"}
            </Button>
          )}
        </article>
      </div>

      <div className="mt-[18px] flex items-center justify-center gap-2 text-[12.5px] text-ink-3">
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Paiement sécurisé · résiliation en 2 clics · données conservées 12
        mois après résiliation
      </div>

      {/* ===== Historique ===== */}
      <section className="mt-[34px] rounded-lg border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-3 border-b border-line-soft p-pad">
          <h2 className="text-[15px] font-bold tracking-[-0.01em]">
            Historique de facturation
          </h2>
        </div>
        <div className="px-pad py-[34px] text-center text-[13.5px] text-ink-3">
          <FileText
            className="mx-auto mb-2 h-[26px] w-[26px] text-ink-3"
            strokeWidth={1.8}
            aria-hidden
          />
          {isPremium ? (
            <>
              <b className="mb-0.5 block text-sm font-[650] text-ink-2">
                Aucun reçu affiché ici pour le moment
              </b>
              Votre abonnement est actif et facturé par Stripe (mode test) —
              le détail des reçus arrivera avec l&apos;espace client dédié.
            </>
          ) : (
            <>
              <b className="mb-0.5 block text-sm font-[650] text-ink-2">
                Aucune facture pour le moment
              </b>
              Vous êtes sur le forfait Gratuit — vos reçus Premium
              apparaîtront ici.
            </>
          )}
        </div>
      </section>
    </div>
  );
}
