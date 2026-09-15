import type { Metadata } from "next";
import { Check } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPitch, PitchHeading } from "@/components/auth/auth-pitch";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Inscription",
};

// Ce que le compte permet dès l'inscription — uniquement des fonctions
// réellement livrées (pas de témoignage : le service n'a pas d'utilisateurs).
const PROOFS = [
  "Mentions légales et TVA ajoutées automatiquement, au centime",
  "Devis accepté en ligne par votre client, sans compte",
  "Relances automatiques des factures échues",
];

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
            factures conformes immédiatement. Gratuit jusqu&apos;à 5 documents par
            mois, sans carte bancaire.
          </PitchHeading>

          <div className="mt-[36px] flex flex-col gap-[13px]">
            {PROOFS.map((proof) => (
              <div
                key={proof}
                className="flex items-start gap-[11px] text-[14px] text-[oklch(0.85_0.006_95)]"
              >
                <Check
                  className="mt-[2px] h-[17px] w-[17px] flex-none text-[oklch(0.75_0.09_264)]"
                  strokeWidth={2.2}
                  aria-hidden
                />
                {proof}
              </div>
            ))}
          </div>
        </AuthPitch>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
