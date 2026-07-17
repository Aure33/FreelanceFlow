"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/errors/error-state";

// Frontière d'erreur du groupe (app) (issue #67) — remplace l'écran générique
// anglais de Next quand une exception serveur remonte (cf. incident prod du
// 10/07). Composant client obligatoire (contrat error.tsx de Next) : reçoit
// l'erreur + `reset()` pour re-rendre le segment. Rendue DANS le shell.
//
// Remontée Sentry (#88) : error.tsx est un filet CÔTÉ CLIENT (hydratation,
// erreurs de rendu React après le premier paint) — captureException() envoie
// l'erreur au dashboard, en plus du `onRequestError` d'instrumentation.ts qui
// couvre le rendu SERVEUR. Les deux se complètent, ni l'un ni l'autre ne
// duplique l'événement (chemins de code distincts).

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalisé côté client pour le diagnostic ; le détail technique n'est
    // jamais montré à l'utilisateur (message sobre ci-dessous).
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorState
      code="Oups"
      title="Une erreur est survenue"
      description="Un problème inattendu nous a empêchés d'afficher cette page. Vous pouvez réessayer — si cela persiste, revenez au tableau de bord."
      actions={
        <>
          <Button type="button" variant="primary" onClick={() => reset()}>
            <RotateCcw strokeWidth={2} />
            Réessayer
          </Button>
          <Button asChild variant="default">
            <Link href="/dashboard">Tableau de bord</Link>
          </Button>
        </>
      }
    />
  );
}
