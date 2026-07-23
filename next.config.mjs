import { withSentryConfig } from "@sentry/nextjs";

// En-têtes de sécurité HTTP (issue #98) appliqués à toutes les réponses.
// Défense en profondeur côté navigateur, complément du contrôle d'accès
// serveur (RLS + filtrage userId). Pas de Content-Security-Policy stricte
// figée ici : Stripe Checkout, Supabase, Sentry et les URLs signées de
// Storage nécessitent une CSP dynamique dont la maintenance dépasse le
// périmètre du projet — les autres en-têtes couvrent le clickjacking, le
// sniffing MIME, la fuite de referrer et forcent HTTPS.
const securityHeaders = [
  // Clickjacking : la page ne peut pas être encadrée par un tiers.
  { key: "X-Frame-Options", value: "DENY" },
  // Empêche l'interprétation MIME devinée (protège des uploads).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ne fuite pas l'URL complète (numéros de pièces, jetons) vers l'extérieur.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Force HTTPS pendant 2 ans (préchargé), sous-domaines compris.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Coupe des API navigateur non utilisées par l'application.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Requis sur Next.js 14 pour que instrumentation.ts soit chargé (stable
  // sans flag depuis Next.js 15) — issue #88.
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
