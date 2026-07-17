// Hook d'instrumentation Next.js — issue #88. `register()` charge la config
// Sentry adaptée au runtime courant (nodejs vs edge) ; `onRequestError` capture
// les erreurs de rendu App Router que Next.js remonte lui-même (au-delà de ce
// que error.tsx intercepte côté client). Nécessite
// `experimental.instrumentationHook: true` (next.config.mjs, requis sur
// Next.js 14 — stable sans flag depuis Next.js 15).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRequestError
  >
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
