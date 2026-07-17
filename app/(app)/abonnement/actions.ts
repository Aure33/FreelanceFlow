"use server";

// Server actions du paywall freemium (issue #10).
//
// SÉCURITÉ (non négociable) : chaque fonction passe par requireUserId() et
// filtre where: { userId }. Le calcul du quota est fait ICI, côté serveur —
// jamais confié au client (la garde réelle est dans emitDocument(), pas dans
// l'UI). Sélections Prisma explicites (éco-conception).
//
// Le compteur mensuel s'appuie sur `documents.emitted_at`, un horodatage
// SERVEUR posé une seule fois par emitDocument() (voir app/(app)/documents/
// actions.ts) — jamais sur `issued_at`, éditable par l'utilisateur dans
// l'éditeur, qui serait contournable en antidatant/postdatant.

import { headers } from "next/headers";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Forme exposée à l'UI (jauge sidebar, bannière Devis/Factures, modale
// paywall, page /abonnement, garde-fou /documents/nouveau).
// documentsLimit : 5 pour "free", null pour "premium" (illimité — pas de
// magic number côté consommateur, un null est explicite à tester).
export type Usage = {
  planType: "free" | "premium";
  documentsThisMonth: number;
  documentsLimit: number | null;
  clientsCount: number;
  memberSince: Date;
};

function normalizePlan(value: string | undefined): "free" | "premium" {
  return value === "premium" ? "premium" : "free";
}

// Bornes du mois calendaire courant, en UTC (même convention que la
// numérotation FAC-/DEV- dans documents/actions.ts : year = getUTCFullYear()).
function currentMonthRangeUtc(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

// Usage courant de l'utilisateur : plan, documents émis ce mois-ci (devis +
// factures confondus, comptés via emittedAt), nombre de clients (informatif,
// illimité quel que soit le plan), ancienneté du compte.
export async function getUsage(): Promise<Usage> {
  const userId = await requireUserId();
  const { start, end } = currentMonthRangeUtc();

  const [me, documentsThisMonth, clientsCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, createdAt: true },
    }),
    prisma.document.count({
      where: { userId, emittedAt: { gte: start, lt: end } },
    }),
    prisma.client.count({ where: { userId } }),
  ]);

  const planType = normalizePlan(me?.planType);

  return {
    planType,
    documentsThisMonth,
    documentsLimit: planType === "premium" ? null : 5,
    clientsCount,
    memberSince: me?.createdAt ?? new Date(),
  };
}

// --- Paiement réel (issue #82, mode TEST Stripe — aucun argent réel) --------
//
// Le forfait n'est accordé QUE par le webhook Stripe (lib/premium.ts), jamais
// par cette action : elle se contente d'ouvrir une session Checkout. Aucun
// paiement n'est confié au client — Stripe héberge le formulaire de carte.

const PRICE_BY_CYCLE = {
  mois: process.env.STRIPE_PRICE_MONTHLY!,
  an: process.env.STRIPE_PRICE_YEARLY!,
} as const;

export type CheckoutResult = { url: string } | { error: string };

// Point d'entrée UI : résout l'origin depuis la requête (next/headers) puis
// délègue à la logique testable ci-dessous.
export async function createCheckoutSession(
  cycle: "mois" | "an",
): Promise<CheckoutResult> {
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host")
      ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? ""));

  return createCheckoutSessionCore(cycle, { origin });
}

// Logique métier isolée de next/headers (mocké de façon incompatible par
// d'autres fichiers d'intégration, cf. #68/#83) : appelée directement par les
// tests avec un contexte origin factice.
export async function createCheckoutSessionCore(
  cycle: "mois" | "an",
  reqCtx: { origin: string },
): Promise<CheckoutResult> {
  const userId = await requireUserId();
  const priceId = PRICE_BY_CYCLE[cycle];
  if (!priceId) return { error: "Configuration de paiement indisponible." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, stripeCustomerId: true },
  });
  if (!user) return { error: "Compte introuvable." };

  // Un seul client Stripe par utilisateur, réutilisé d'une tentative à
  // l'autre (évite les doublons si un paiement est annulé puis retenté).
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId } },
      success_url: `${reqCtx.origin}/abonnement?checkout=success`,
      cancel_url: `${reqCtx.origin}/abonnement?checkout=cancel`,
    });
    if (!session.url) return { error: "Impossible d'ouvrir le paiement." };
    return { url: session.url };
  } catch {
    // Jamais de détail Stripe (clé, config) exposé au client.
    return {
      error: "Impossible d'ouvrir le paiement. Réessayez dans un instant.",
    };
  }
}
