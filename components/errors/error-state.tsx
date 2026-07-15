import type { ReactNode } from "react";

// État d'erreur/introuvable présentationnel (issue #67) — mutualisé entre
// `app/not-found.tsx` (404 hors shell), `app/(app)/not-found.tsx` (404 dans le
// shell) et `app/(app)/error.tsx` (exception serveur). Aucun hook, aucun
// "use client" : le composant reste importable côté serveur comme client.
// Tokens uniquement → thèmes clair/sombre automatiques. A11y : titre lié à la
// région, code décoratif aria-hidden (l'information utile est dans le titre).

export function ErrorState({
  code,
  title,
  description,
  actions,
}: {
  code: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p
          aria-hidden
          className="num text-[64px] font-bold leading-none text-accent"
        >
          {code}
        </p>
        <h1 className="mt-4 text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-2.5 text-[14px] leading-[1.6] text-ink-2">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      </div>
    </div>
  );
}
