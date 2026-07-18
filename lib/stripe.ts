// Client Stripe — instanciation PARESSEUSE (issue #82). `new Stripe(...)`
// lève immédiatement si `apiKey` est vide/absent (contrairement à Sentry, qui
// no-op proprement sans DSN) — un import au niveau module planterait la
// collecte de pages de `next build` dans un environnement sans
// STRIPE_SECRET_KEY (ex. le job `build` de la CI, qui n'injecte les secrets
// Stripe que dans les jobs de test). On ne construit donc le client qu'à la
// PREMIÈRE utilisation réelle (une requête entrante), jamais au chargement du
// module.

import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeSingleton;
}
