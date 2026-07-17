// Sentry — capture des erreurs CLIENT (navigateur) — issue #88.
// Chargé automatiquement par le plugin @sentry/nextjs (withSentryConfig,
// next.config.mjs). Palier Developer gratuit (5000 erreurs/mois).
//
// DSN en variable publique (NEXT_PUBLIC_*) : ce n'est PAS un secret — il ne
// permet que d'ENVOYER des événements à ce projet Sentry, jamais de les lire.
// Si absent (dev sans .env.local complet), Sentry.init() no-op proprement.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Ni tracing (tracesSampleRate) ni Session Replay : hors périmètre de #88
  // (monitoring d'ERREURS) et ces deux options font gonfler le bundle client
  // de ~40 Ko gzip même désactivées à 0 (la simple présence de la clé suffit
  // à inclure le code) — inacceptable face au budget éco-conception (#62).
  // `webpack.treeshake.removeTracing` (next.config.mjs) retire le code
  // correspondant du SDK au build.
});
