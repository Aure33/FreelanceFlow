"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { AUTH_BLOCK_BTN, AUTH_INPUT, AUTH_LABEL } from "./auth-classes";
import { AuthSwitch, FormError, OrSeparator } from "./auth-parts";
import { GoogleButton } from "./google-button";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Sur succès, la server action redirige elle-même vers /dashboard : `res`
    // est alors undefined → on ne fait rien. On n'affiche l'erreur que si
    // l'action en a renvoyé une.
    const res = await signIn({ email, password });
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
        Content de vous revoir
      </h1>
      <p className="mb-[30px] text-[14.5px] text-ink-3">
        Connectez-vous pour retrouver votre activité.
      </p>

      <form onSubmit={handleSubmit} noValidate>
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

        <div className="mb-4">
          <label
            htmlFor="password"
            className="mb-[6px] flex items-center justify-between text-[13px] font-semibold text-ink-2"
          >
            <span>Mot de passe</span>
            <Link
              href="/mot-de-passe-oublie"
              prefetch={false}
              className="text-[12.5px] font-medium text-accent-ink hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            className={AUTH_INPUT}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <FormError message={error} />

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className={AUTH_BLOCK_BTN}
        >
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      <OrSeparator />
      <GoogleButton label="Continuer avec Google" />

      <AuthSwitch
        text="Pas encore de compte ?"
        href="/inscription"
        linkLabel="Essayer gratuitement"
      />

      <p className="mt-[14px] text-center text-[12px] leading-[1.5] text-ink-3">
        En vous connectant, vous acceptez les{" "}
        <Link href="/legal#cgu" prefetch={false} className="underline">
          CGU
        </Link>
        .<br />
        Vos données restent en France.
      </p>
    </>
  );
}
