"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { createShareLink, revokeShareLink } from "@/app/(app)/documents/actions";

// Îlot de partage d'un devis (issue #85) — visible sur la vue d'un devis émis.
// Crée un lien public tokenisé (/proposition/<token>), le copie, ou le révoque.
// Le propriétaire seul peut agir (server actions filtrées `userId`).
export function ShareQuote({
  id,
  initialToken,
}: {
  id: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Origine résolue côté client (le composant est monté dans le navigateur).
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/proposition/${token}`
      : token
        ? `/proposition/${token}`
        : null;

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createShareLink(id);
      if ("error" in res) setError(res.error);
      else setToken(res.token);
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      const res = await revokeShareLink(id);
      if ("error" in res) setError(res.error);
      else {
        setToken(null);
        setCopied(false);
      }
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement.");
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">
          Partager avec le client
        </h2>
      </div>
      <div className="p-pad">
        {!token ? (
          <>
            <p className="mb-3 text-[13px] leading-[1.5] text-ink-3">
              Générez un lien public : votre client pourra consulter puis
              accepter ou refuser ce devis sans créer de compte.
            </p>
            <button
              type="button"
              onClick={create}
              disabled={isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-accent bg-accent px-3.5 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              Créer un lien de partage
            </button>
          </>
        ) : (
          <>
            <label htmlFor="share-url" className="mb-1.5 block text-[12.5px] font-semibold text-ink-3">
              Lien public
            </label>
            <div className="flex gap-2">
              <input
                id="share-url"
                type="text"
                readOnly
                value={url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <button
                type="button"
                onClick={copy}
                aria-label="Copier le lien"
                className="inline-flex h-[38px] flex-none items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-surface-2"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-ok-ink" strokeWidth={2} aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                )}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
            <button
              type="button"
              onClick={revoke}
              disabled={isPending}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-danger-ink transition-colors hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Révoquer le lien
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[12.5px] font-medium text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
