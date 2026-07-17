// Sentry — capture des erreurs EDGE (middleware.ts, runtime "edge") — issue #88.
// Chargé par instrumentation.ts (register()) pour le runtime "edge".

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Pas de tracesSampleRate : hors périmètre de #88 (erreurs, pas performance).
  // PII (issue #88) — même garde que sentry.server.config.ts.
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    return event;
  },
});
