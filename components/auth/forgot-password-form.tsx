"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, User } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { AUTH_BLOCK_BTN, AUTH_INPUT, AUTH_LABEL } from "./auth-classes";
import { AuthSwitch, FormError } from "./auth-parts";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await requestPasswordReset({ email });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSent(true);
  }

  async function handleResend() {
    await requestPasswordReset({ email });
    setResent(true);
  }

  return (
    <>
      <Link
        href="/connexion"
        prefetch={false}
        className="mb-[28px] inline-flex items-center gap-[7px] text-[13.5px] font-semibold text-ink-3 transition-colors hover:text-accent-ink"
      >
        <ArrowLeft className="h-[15px] w-[15px]" strokeWidth={2.2} aria-hidden />
        Retour à la connexion
      </Link>

      {!sent ? (
        /* —— Étape 1 : demande —— */
        <form onSubmit={handleSubmit} noValidate>
          <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
            Mot de passe oublié ?
          </h1>
          <p className="mb-[30px] text-[14.5px] leading-[1.55] text-ink-3">
            Indiquez l&apos;adresse e-mail de votre compte. Si elle existe chez
            nous, vous recevrez un lien de réinitialisation.
          </p>

          <div className="mb-4">
            <label htmlFor="email" className={AUTH_LABEL}>
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="camille@studio.fr"
              className={AUTH_INPUT}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <FormError message={error} />

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className={AUTH_BLOCK_BTN}
          >
            {loading ? "Envoi…" : "Envoyer le lien de réinitialisation"}
          </Button>

          <AuthSwitch
            text="Pas encore de compte ?"
            href="/inscription"
            linkLabel="Essayer gratuitement"
          />
        </form>
      ) : (
        /* —— Étape 2 : e-mail envoyé —— */
        <div>
          <div className="mb-[20px] grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-ok-soft text-ok-ink">
            <Mail className="h-[24px] w-[24px]" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
            Vérifiez votre boîte mail
          </h1>
          <p className="mb-[30px] text-[14.5px] leading-[1.55] text-ink-3">
            Si un compte existe pour cette adresse, un lien de réinitialisation
            vient d&apos;y être envoyé. Il est valable 30 minutes.
          </p>

          <div className="mb-[22px] flex items-center gap-[10px] rounded-md border border-line-soft bg-surface-2 px-[14px] py-[11px] text-[14px] font-semibold">
            <User
              className="h-[16px] w-[16px] flex-none text-ink-3"
              strokeWidth={2}
              aria-hidden
            />
            <span>{email}</span>
          </div>

          <Button asChild className="h-[44px] w-full justify-center text-[14.5px]">
            <Link href="/connexion" prefetch={false}>
              Retour à la connexion
            </Link>
          </Button>

          <p className="mt-[18px] text-[13.5px] leading-[1.6] text-ink-3">
            Rien reçu après quelques minutes ? Vérifiez vos indésirables ou{" "}
            {resent ? (
              <span className="font-[650] text-accent-ink">
                e-mail renvoyé ✓
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="font-[650] text-accent-ink hover:underline"
              >
                renvoyer l&apos;e-mail
              </button>
            )}
            .
          </p>
        </div>
      )}
    </>
  );
}
