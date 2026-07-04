import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPitch, PitchHeading } from "@/components/auth/auth-pitch";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Inscription",
};

export default function InscriptionPage() {
  return (
    <AuthShell
      pitch={
        <AuthPitch>
          <PitchHeading
            title={
              <>
                Votre première facture
                <br />
                dans 3 minutes.
              </>
            }
          >
            Créez votre compte, renseignez votre SIRET, et émettez des devis et
            factures conformes immédiatement. Gratuit pendant 30 jours, sans
            carte bancaire.
          </PitchHeading>

          {/* Témoignage client. */}
          <figure className="mt-[36px] rounded-lg border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.05)] px-[20px] py-[18px]">
            <blockquote className="text-[14.5px] leading-[1.6] text-[oklch(0.88_0.006_95)]">
              « J&apos;ai envoyé mon premier devis le soir même de
              l&apos;inscription. Les relances automatiques m&apos;ont fait
              gagner deux semaines de trésorerie. »
            </blockquote>
            <figcaption className="mt-[14px] flex items-center gap-[10px]">
              <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-[linear-gradient(135deg,oklch(0.55_0.13_264),oklch(0.5_0.12_295))] text-[11px] font-bold text-white">
                SB
              </div>
              <small className="text-[12.5px] text-[oklch(0.68_0.008_95)]">
                <b className="text-[oklch(0.88_0.006_95)]">Sophie Bréhat</b> ·
                architecte d&apos;intérieur, Nantes
              </small>
            </figcaption>
          </figure>
        </AuthPitch>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
