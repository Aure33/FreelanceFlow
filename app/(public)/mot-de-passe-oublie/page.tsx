import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPitch, PitchHeading } from "@/components/auth/auth-pitch";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
};

export default function MotDePasseOubliePage() {
  return (
    <AuthShell
      pitch={
        <AuthPitch>
          <PitchHeading
            title={
              <>
                Ça arrive
                <br />
                aux meilleurs.
              </>
            }
          >
            Recevez un lien sécurisé par e-mail et choisissez un nouveau mot de
            passe. Le lien expire au bout de 30 minutes, votre compte reste
            protégé.
          </PitchHeading>
        </AuthPitch>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
