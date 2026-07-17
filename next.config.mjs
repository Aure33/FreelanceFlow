import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Requis sur Next.js 14 pour que instrumentation.ts soit chargé (stable
  // sans flag depuis Next.js 15) — issue #88.
  experimental: {
    instrumentationHook: true,
  },
};

// Pas de SENTRY_AUTH_TOKEN (aucun token d'organisation fourni) : l'upload de
// sourcemaps est explicitement désactivé plutôt que de tenter puis échouer
// silencieusement — les erreurs restent capturées, seule la stack trace
// démininifiée dans le dashboard Sentry n'est pas disponible pour le bundle
// client de prod. Rien d'autre ne dépend de ce token.
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  // Retire le code de tracing/logging du SDK au build (aucun tracesSampleRate
  // configuré, cf. sentry.*.config.ts) — garde le bundle client au plus léger
  // possible (éco-conception, #62).
  webpack: {
    treeshake: { removeDebugLogging: true, removeTracing: true },
  },
});
