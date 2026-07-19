import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileText, LineChart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/public-nav";
import { PublicFooter } from "@/components/public/public-footer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Devis, factures et suivi pour indépendants",
};

// Conteneur centré (max 1080px) réutilisé par les sections de la landing.
const WRAP = "mx-auto max-w-[1080px] px-7";

// Pastille de statut de l'aperçu produit (reproduit `.tag` du design system).
function Tag({ tone, children }: { tone: "ok" | "warn"; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold",
        tone === "ok" ? "bg-ok-soft text-ok-ink" : "bg-warn-soft text-warn-ink"
      )}
    >
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <>
      <PublicNav sticky showLinks />

      {/* ============ HERO ============ */}
      <section className={cn("pb-16 pt-[84px] text-center", WRAP)}>
        <div className="mb-[22px] inline-flex items-center gap-2 rounded-[99px] bg-accent-soft px-[14px] py-1.5 text-[13px] font-semibold text-accent-ink">
          <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          Conforme au Code de commerce — mentions automatiques
        </div>
        <h1 className="mx-auto mb-[18px] max-w-[720px] text-[clamp(34px,5vw,52px)] font-extrabold leading-[1.1] tracking-[-0.035em] [text-wrap:balance]">
          La facturation des indépendants,{" "}
          <em className="not-italic text-accent-ink">sans la paperasse</em>.
        </h1>
        <p className="mx-auto mb-8 max-w-[560px] text-[17px] leading-[1.6] text-ink-2 [text-wrap:pretty]">
          Devis, factures conformes, relances et suivi du chiffre d&apos;affaires.
          Pensé pour les freelances, pas pour les comptables.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            asChild
            variant="primary"
            className="h-[46px] px-[22px] text-[15px]"
          >
            {/* prefetch=false : /inscription et /connexion arrivent en #3 */}
            <Link href="/inscription" prefetch={false}>
              Créer mon compte gratuit
            </Link>
          </Button>
          <Button asChild className="h-[46px] px-[22px] text-[15px]">
            <Link href="/connexion" prefetch={false}>
              Se connecter
            </Link>
          </Button>
        </div>
        <div className="mt-3.5 text-[12.5px] text-ink-3">
          30 jours d&apos;essai · sans carte bancaire · données hébergées en France
        </div>

        {/* Aperçu produit (décoratif) */}
        <div
          aria-hidden="true"
          className="mx-auto mt-14 max-w-[860px] rounded-xl border border-line bg-surface p-[22px] text-left shadow-lg"
        >
          <div className="mb-[18px] flex items-center gap-1.5">
            <i className="block h-[9px] w-[9px] rounded-full bg-line" />
            <i className="block h-[9px] w-[9px] rounded-full bg-line" />
            <i className="block h-[9px] w-[9px] rounded-full bg-line" />
          </div>
          <div className="mb-[14px] grid grid-cols-3 gap-[14px] max-[900px]:grid-cols-1">
            <div className="rounded-md bg-surface-2 px-4 py-[14px]">
              <div className="text-[12px] font-semibold text-ink-3">CA de juin</div>
              <div className="num mt-0.5 text-[19px] font-semibold">4 820 €</div>
            </div>
            <div className="rounded-md bg-surface-2 px-4 py-[14px]">
              <div className="text-[12px] font-semibold text-ink-3">
                En attente de paiement
              </div>
              <div className="num mt-0.5 text-[19px] font-semibold">3 540 €</div>
            </div>
            <div className="rounded-md bg-surface-2 px-4 py-[14px]">
              <div className="text-[12px] font-semibold text-ink-3">
                Encaissé cette année
              </div>
              <div className="num mt-0.5 text-[19px] font-semibold text-ok-ink">
                38 270 €
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line-soft px-1 py-[11px] text-[13.5px]">
            <span className="num w-[110px] text-[12px] text-ink-3">FAC-2026-032</span>
            <span className="flex-1 font-semibold">
              Atelier Lumen — Refonte portfolio
            </span>
            <Tag tone="warn">Envoyée</Tag>
            <span className="num font-semibold">1 140 €</span>
          </div>
          <div className="flex items-center gap-3 border-t border-line-soft px-1 py-[11px] text-[13.5px]">
            <span className="num w-[110px] text-[12px] text-ink-3">FAC-2026-030</span>
            <span className="flex-1 font-semibold">Nord Web — Site vitrine</span>
            <Tag tone="ok">Payée</Tag>
            <span className="num font-semibold">2 160 €</span>
          </div>
          <div className="flex items-center gap-3 border-t border-line-soft px-1 py-[11px] text-[13.5px]">
            <span className="num w-[110px] text-[12px] text-ink-3">DEV-2026-016</span>
            <span className="flex-1 font-semibold">
              Nord Web — Maintenance annuelle
            </span>
            <Tag tone="warn">À relancer</Tag>
            <span className="num font-semibold">1 800 €</span>
          </div>
        </div>
      </section>

      {/* ============ BÉNÉFICES ============ */}
      <section id="fonctions" className={cn("py-[72px]", WRAP)}>
        <div className="grid grid-cols-3 gap-gap max-[900px]:grid-cols-1">
          <article className="rounded-lg border border-line bg-surface p-[26px] shadow-sm">
            <div className="mb-4 grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
              <FileText className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <h3 className="mb-2 text-[16.5px] font-[750] tracking-[-0.015em]">
              Une facture en 3 clics
            </h3>
            <p className="text-sm leading-[1.6] text-ink-2">
              Client, projet, prestations : les totaux et la TVA se calculent en
              direct, selon votre régime. Le PDF est prêt à envoyer.
            </p>
          </article>
          <article className="rounded-lg border border-line bg-surface p-[26px] shadow-sm">
            <div className="mb-4 grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
              <Send className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <h3 className="mb-2 text-[16.5px] font-[750] tracking-[-0.015em]">
              Des relances qui tombent à pic
            </h3>
            <p className="text-sm leading-[1.6] text-ink-2">
              Échéances suivies automatiquement, relances en un clic. Vous êtes payé
              plus vite, sans e-mails gênants à rédiger.
            </p>
          </article>
          <article className="rounded-lg border border-line bg-surface p-[26px] shadow-sm">
            <div className="mb-4 grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
              <LineChart className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <h3 className="mb-2 text-[16.5px] font-[750] tracking-[-0.015em]">
              Votre activité en un regard
            </h3>
            <p className="text-sm leading-[1.6] text-ink-2">
              Chiffre d&apos;affaires, encours, devis à relancer : le tableau de bord
              vous dit chaque matin où vous en êtes.
            </p>
          </article>
        </div>
      </section>

      {/* ============ BANDE CTA ============ */}
      {/* Fond sombre figé dans les deux thèmes (var(--ink) s'inverse en sombre) :
          exception décorative assumée, comme le document A4. */}
      <div className={WRAP}>
        <section className="relative mb-20 overflow-hidden rounded-xl bg-[oklch(0.23_0.012_75)] p-[52px] text-center text-[oklch(0.95_0.005_95)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-[140px] -top-[140px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,oklch(0.48_0.14_264/0.4),transparent_70%)]"
          />
          <h2 className="mb-2.5 text-[28px] font-extrabold tracking-[-0.03em]">
            Votre première facture dans 3 minutes.
          </h2>
          <p className="mb-[26px] text-[oklch(0.78_0.008_95)]">
            Créez votre compte, renseignez votre SIRET, facturez. C&apos;est tout.
          </p>
          <Button
            asChild
            variant="primary"
            className="relative h-[46px] px-[24px] text-[15px]"
          >
            <Link href="/inscription" prefetch={false}>
              Essayer gratuitement
            </Link>
          </Button>
        </section>
      </div>

      <PublicFooter />
    </>
  );
}
