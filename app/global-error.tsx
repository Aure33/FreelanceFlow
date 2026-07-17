"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { ErrorState } from "@/components/errors/error-state";

// Frontière d'erreur RACINE (issue #88) — seul filet pour une exception dans
// le layout racine lui-même (app/layout.tsx), que app/(app)/error.tsx et
// app/(public)/... ne peuvent pas intercepter (ils sont IMBRIQUÉS dans ce
// layout). Contrat Next.js : ce composant remplace le <html>/<body> entier
// quand il se déclenche — il doit donc les fournir lui-même.
//
// Cas extrêmement rare en pratique (le layout racine ne fait qu'un script
// inline anti-flash de thème) ; couvert par prudence pour que même ce chemin
// remonte dans Sentry plutôt que l'écran blanc générique de Next.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <ErrorState
          code="Oups"
          title="Une erreur est survenue"
          description="Un problème inattendu a empêché le chargement de l'application. Rechargez la page — si cela persiste, contactez le support."
          actions={
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-accent bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:border-accent-hover hover:bg-accent-hover"
            >
              Retour à l&apos;accueil
            </a>
          }
        />
      </body>
    </html>
  );
}
