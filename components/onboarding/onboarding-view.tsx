import Link from "next/link";
import { Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { computeOnboarding, type OnboardingCounts } from "@/lib/onboarding";
import { DismissOnboardingButton } from "./dismiss-button";

// Écran « Premier lancement » (issue #60) — maquette `Premier lancement.html`.
// Remplace le tableau de bord d'un compte neuf (aucun document) : checklist de
// 3 étapes câblées sur les vrais parcours (#12 profil, #5 client, #8 document),
// carte d'aide, KPI vides. Composant SERVEUR (aucun état) ; seule l'action
// « Ignorer ce guide » est un îlot client (cookie + refresh).

// Les 3 étapes de la maquette. Écart assumé avec la maquette sur l'étape 2 :
// « SIREN » → « SIRET » (le modèle et le formulaire client utilisent le SIRET
// 14 chiffres depuis #5 — la maquette précède ce renommage).
const STEPS = [
  {
    title: "Renseignez votre SIRET et votre régime de TVA",
    desc: "Indispensables pour émettre des documents conformes — vérifiés au répertoire SIRENE.",
    href: "/parametres",
    cta: "Compléter",
  },
  {
    title: "Créez votre premier client",
    desc: "Nom, SIRET, adresse de facturation. Vous pourrez l'enrichir plus tard.",
    href: "/clients/nouveau",
    cta: "Créer un client",
  },
  {
    title: "Émettez votre premier devis ou facture",
    desc: "TVA calculée en direct selon votre régime, PDF prêt à envoyer.",
    href: "/documents/nouveau",
    cta: "Nouveau document",
  },
] as const;

// « Trois étapes vous séparent… » s'adapte à l'avancement réel.
const REMAINING_PHRASE: Record<number, string> = {
  3: "Trois étapes vous séparent de votre première facture.",
  2: "Deux étapes vous séparent de votre première facture.",
  1: "Plus qu'une étape vous sépare de votre première facture.",
};

export function OnboardingView({
  firstName,
  counts,
}: {
  firstName: string;
  counts: OnboardingCounts;
}) {
  const state = computeOnboarding(counts);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(
    new Date(),
  );

  return (
    <>
      {/* En-tête (`.page-head`) + sortie du guide (exigence « ignorable ») */}
      <div className="mb-6 flex flex-wrap items-end gap-[18px]">
        <div>
          <div className="text-2xl font-extrabold tracking-[-0.03em]">
            Bienvenue{firstName ? `, ${firstName}` : ""}
          </div>
          <div className="mt-[3px] text-sm text-ink-3">
            Votre compte est prêt.{" "}
            {REMAINING_PHRASE[state.remainingMinutes] ?? REMAINING_PHRASE[3]}
          </div>
        </div>
        <div className="ml-auto">
          <DismissOnboardingButton />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_380px] items-start gap-gap max-[1100px]:grid-cols-1">
        {/* Checklist « Premiers pas » */}
        <section
          aria-labelledby="onboarding-steps-title"
          className="rounded-lg border border-line bg-surface shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
            <h2
              id="onboarding-steps-title"
              className="text-[15px] font-bold tracking-[-0.01em]"
            >
              Premiers pas
            </h2>
            <span className="num ml-auto text-[12.5px] text-ink-3">
              {state.doneCount} / 3 terminés · ~{state.remainingMinutes} min
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Progression des premiers pas"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={state.doneCount}
            className="h-[5px] bg-surface-2"
          >
            <span
              className="block h-full rounded-r-full bg-accent"
              style={{ width: `${state.progressPct}%` }}
            />
          </div>

          <ol className="list-none">
            {STEPS.map((step, i) => {
              const stepState = state.steps[i];
              return (
                <li
                  key={step.href}
                  aria-current={stepState === "now" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-4 border-b border-line-soft px-pad py-[18px] last:border-b-0",
                    stepState === "todo" && "opacity-55",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "num grid h-[34px] w-[34px] flex-none place-items-center rounded-full border-[1.5px] text-[13.5px] font-semibold",
                      stepState === "done"
                        ? "border-ok bg-ok-soft text-ok-ink"
                        : stepState === "now"
                          ? "border-accent bg-accent-soft text-accent-ink"
                          : "border-line text-ink-2",
                    )}
                  >
                    {stepState === "done" ? (
                      <Check className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[14.5px] font-[650] tracking-[-0.01em]">
                      {step.title}
                      {stepState === "done" && (
                        <span className="sr-only"> (terminé)</span>
                      )}
                    </b>
                    <small className="block text-[13px] leading-[1.45] text-ink-3">
                      {step.desc}
                    </small>
                  </div>
                  {stepState !== "done" && (
                    <>
                      <span className="num whitespace-nowrap text-[11.5px] text-ink-3">
                        1 min
                      </span>
                      <Button
                        asChild
                        size="sm"
                        variant={stepState === "now" ? "primary" : "default"}
                      >
                        <Link href={step.href}>{step.cta}</Link>
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Aide latérale */}
        <section
          aria-labelledby="onboarding-help-title"
          className="rounded-lg border border-line bg-surface shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
            <h2
              id="onboarding-help-title"
              className="text-[15px] font-bold tracking-[-0.01em]"
            >
              Pourquoi ces trois étapes ?
            </h2>
          </div>
          <div className="p-pad">
            <p className="mb-3.5 text-[13.5px] leading-[1.6] text-ink-2">
              Une facture française doit comporter vos{" "}
              <b className="font-[650] text-ink">mentions légales</b> (SIRET,
              régime de TVA) et celles de votre client. Une fois ces
              informations saisies, elles sont reportées automatiquement sur
              chaque document — vous n&apos;y reviendrez plus.
            </p>
            <div className="flex gap-[11px] rounded-md bg-accent-soft px-4 py-[13px] text-[13px] leading-[1.55] text-accent-ink">
              <Info
                className="mt-[2px] h-4 w-4 flex-none"
                strokeWidth={2}
                aria-hidden
              />
              <span>
                Le forfait Gratuit inclut{" "}
                <b className="font-[650]">5 documents par mois</b>, sans limite
                de clients ni de projets — largement de quoi tester en
                conditions réelles.
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* KPI vides — valeurs neutres tant qu'aucun document n'existe */}
      <div
        className="mt-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2"
        aria-label="Vos indicateurs apparaîtront après votre première facture"
      >
        <EmptyKpi
          label={`CA de ${monthLabel}`}
          value="— €"
          foot="Après votre première facture"
        />
        <EmptyKpi
          label="En attente de paiement"
          value="— €"
          foot="Aucune facture émise"
        />
        <EmptyKpi label="Devis en cours" value="0" foot="Aucun devis envoyé" />
        <EmptyKpi
          label="Clients"
          value={String(counts.clientCount)}
          foot={
            counts.clientCount > 0
              ? "Étape 2 terminée"
              : "Commencez par l'étape 2"
          }
        />
      </div>
    </>
  );
}

function EmptyKpi({
  label,
  value,
  foot,
}: {
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="num mb-2 mt-1.5 text-[27px] font-bold tracking-[-0.02em] text-ink-3">
        {value}
      </div>
      <div className="text-[12.5px] text-ink-3">{foot}</div>
    </div>
  );
}
