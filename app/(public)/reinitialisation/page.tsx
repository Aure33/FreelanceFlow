import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthPitch, PitchHeading } from "@/components/auth/auth-pitch";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
};

export default function ReinitialisationPage() {
  return (
    <AuthShell
      pitch={
        <AuthPitch>
          <PitchHeading
            title={
              <>
                Un nouveau départ,
                <br />
                bien protégé.
              </>
            }
          >
            Choisissez un mot de passe robuste et unique. Toutes vos sessions
            ouvertes seront déconnectées par sécurité.
          </PitchHeading>
        </AuthPitch>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
