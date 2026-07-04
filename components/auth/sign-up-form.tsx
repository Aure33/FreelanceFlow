"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { AUTH_BLOCK_BTN, AUTH_INPUT, AUTH_LABEL } from "./auth-classes";
import { AuthSwitch, FormError, OrSeparator } from "./auth-parts";
import { GoogleButton } from "./google-button";

export function SignUpForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Sur succès, la server action redirige elle-même (vers /dashboard ou
    // /connexion) : `res` est alors undefined → on ne fait rien, la navigation
    // se produit. On n'affiche l'erreur que si l'action en a renvoyé une.
    const res = await signUp({ firstName, lastName, email, password });
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
        Créer votre compte
      </h1>
      <p className="mb-[30px] text-[14.5px] text-ink-3">
        Essai gratuit de 30 jours — sans carte bancaire.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-2 gap-[12px]">
          <div className="mb-4 min-w-0">
            <label htmlFor="firstName" className={AUTH_LABEL}>
              Prénom
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="Camille"
              className={AUTH_INPUT}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="mb-4 min-w-0">
            <label htmlFor="lastName" className={AUTH_LABEL}>
              Nom
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Laurent"
              className={AUTH_INPUT}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="email" className={AUTH_LABEL}>
            Adresse e-mail professionnelle
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
          <label htmlFor="password" className={AUTH_LABEL}>
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••"
            className={AUTH_INPUT}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-[6px] text-[12px] text-ink-3">
            8 caractères minimum, dont un chiffre.
          </p>
        </div>

        <FormError message={error} />

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className={AUTH_BLOCK_BTN}
        >
          {loading ? "Création…" : "Créer mon compte"}
        </Button>
      </form>

      <OrSeparator />
      <GoogleButton label="S'inscrire avec Google" />

      <AuthSwitch
        text="Déjà un compte ?"
        href="/connexion"
        linkLabel="Se connecter"
      />

      <p className="mt-[14px] text-center text-[12px] leading-[1.5] text-ink-3">
        En créant un compte, vous acceptez les{" "}
        <Link href="/legal#cgu" prefetch={false} className="underline">
          CGU
        </Link>
        .<br />
        Vos données restent en France.
      </p>
    </>
  );
}
