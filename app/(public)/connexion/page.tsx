import type { Metadata } from "next";
import { Check } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPitch, PitchHeading } from "@/components/auth/auth-pitch";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Connexion",
};

// Preuves affichées dans le panneau « promesse ».
const PROOFS = [
  "Factures conformes au Code de commerce, mentions ajoutées automatiquement",
  "TVA calculée selon votre régime — micro, franchise ou réel",
  "Relances de paiement en un clic",
];

export default function ConnexionPage() {
  return (
    <AuthShell
      pitch={
        <AuthPitch>
          <PitchHeading
            title={
              <>
                L&apos;administratif en moins.
                <br />
                Le métier en plus.
              </>
            }
          >
            Devis, factures conformes, relances et suivi de votre chiffre
            d&apos;affaires — pensé pour les indépendants, pas pour les
            comptables.
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
      <SignInForm />
    </AuthShell>
  );
}
