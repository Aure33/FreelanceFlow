"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { updatePassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AUTH_BLOCK_BTN, AUTH_INPUT, AUTH_LABEL } from "./auth-classes";
import { FormError } from "./auth-parts";

// Score de robustesse (repris tel quel du <script> de la maquette) :
// ≥ 8 → +1, chiffre + lettre → +1, ≥ 12 ou symbole → +1 (minimum 1 dès qu'il y a
// une saisie).
function score(v: string): number {
  if (!v) return 0;
  let s = 0;
  if (v.length >= 8) s++;
  if (/\d/.test(v) && /[a-zA-Z]/.test(v)) s++;
  if (v.length >= 12 || /[^a-zA-Z0-9]/.test(v)) s++;
  return Math.max(1, s);
}

const STRENGTH_BAR = ["", "bg-danger", "bg-warn", "bg-ok"];

function strengthLabel(v: string, s: number): string {
  if (!v) return "8 caractères minimum, dont un chiffre.";
  if (s === 1) return "Trop court — 8 caractères minimum.";
  if (s === 2) return "Correct — ajoutez un symbole pour renforcer.";
  return "Mot de passe robuste.";
}

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const s = score(password);
  // Règles serveur autoritatives : 8 caractères min + au moins un chiffre.
  const rulesOk = password.length >= 8 && /\d/.test(password);
  const matches = confirm !== "" && password === confirm;
  const canSubmit = rulesOk && matches && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await updatePassword({ password });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    /* —— État succès —— */
    return (
      <div>
        <div className="mb-[20px] grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-ok-soft text-ok-ink">
          <Check className="h-[24px] w-[24px]" strokeWidth={2.2} aria-hidden />
        </div>
        <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
          Mot de passe modifié
        </h1>
        <p className="mb-[30px] text-[14.5px] leading-[1.55] text-ink-3">
          Votre mot de passe a bien été réinitialisé et vos autres sessions ont
          été déconnectées. Vous pouvez vous reconnecter.
        </p>

        <Button asChild variant="primary" className={AUTH_BLOCK_BTN}>
          <Link href="/connexion" prefetch={false}>
            Se connecter
          </Link>
        </Button>
      </div>
    );
  }

  /* —— Saisie —— */
  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1 className="mb-[6px] text-[24px] font-extrabold tracking-[-0.03em]">
        Choisir un nouveau mot de passe
      </h1>
      <p className="mb-[30px] text-[14.5px] leading-[1.55] text-ink-3">
        Saisissez un nouveau mot de passe pour votre compte. Vos autres sessions
        seront déconnectées par sécurité.
      </p>

      <div className="mb-4">
        <label htmlFor="password" className={AUTH_LABEL}>
          Nouveau mot de passe
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
        {/* Jauge de robustesse — indicateur décoratif. */}
        <div className="mt-[8px] flex gap-[5px]" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <i
              key={i}
              className={cn(
                "h-[4px] flex-1 rounded-[99px] transition-colors",
                password && i < s ? STRENGTH_BAR[s] : "bg-line-soft"
              )}
            />
          ))}
        </div>
        <p className="mt-[6px] text-[12px] text-ink-3">
          {strengthLabel(password, s)}
        </p>
      </div>

      <div className="mb-4">
        <label htmlFor="confirm" className={AUTH_LABEL}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••"
          className={AUTH_INPUT}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm !== "" && (
          <p
            className={cn(
              "mt-[6px] text-[12px] font-semibold",
              matches ? "text-ok-ink" : "text-danger-ink"
            )}
          >
            {matches
              ? "Les mots de passe correspondent."
              : "Les mots de passe ne correspondent pas."}
          </p>
        )}
      </div>

      <FormError message={error} />

      <Button
        type="submit"
        variant="primary"
        disabled={!canSubmit}
        className={AUTH_BLOCK_BTN}
      >
        {loading ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
      </Button>

      <div className="mt-[26px] text-center text-[14px] text-ink-2">
        <Link
          href="/connexion"
          prefetch={false}
          className="font-[650] text-accent-ink hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    </form>
  );
}
