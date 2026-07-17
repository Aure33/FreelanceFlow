// Sentry — capture des erreurs SERVEUR (runtime Node.js) — issue #88.
// Chargé par instrumentation.ts (register()) pour le runtime "nodejs" —
// couvre les server actions, routes API, et le rendu serveur des pages.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Pas de tracesSampleRate : hors périmètre de #88 (erreurs, pas performance).
  // PII (issue #88) : le corps de requête d'une server action peut contenir
  // e-mail client, IBAN, montants saisis — aucune valeur pour un diagnostic
  // (la stack trace suffit), on ne l'envoie jamais à Sentry. `sendDefaultPii`
  // reste à sa valeur par défaut (false) : pas d'IP ni de cookies non plus.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
