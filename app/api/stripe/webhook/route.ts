import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { applyPremiumPlan, revokePremiumPlan } from "@/lib/premium";
import { prisma } from "@/lib/prisma";

// Webhook Stripe (issue #82) — SEUL endroit qui accorde/retire le forfait
// Premium. AUCUNE session ici (Stripe appelle ce endpoint serveur-à-serveur,
// pas un navigateur) : l'authenticité vient EXCLUSIVEMENT de la signature
// (STRIPE_WEBHOOK_SECRET), jamais d'un cookie. Runtime Node (crypto pour la
// vérification de signature).
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  // Corps BRUT obligatoire pour la vérification HMAC — jamais request.json()
  // avant constructEventAsync (une reformatage du JSON invaliderait la
  // signature calculée par Stripe sur les octets exacts envoyés).
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  // Idempotent par construction : rejouer le même événement réapplique le
  // même état final (pas de compteur ni d'effet cumulatif) — pas besoin d'un
  // registre d'event.id pour un projet de cette taille.
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const userId = session.client_reference_id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (userId && customerId && subscriptionId) {
        await applyPremiumPlan(userId, { customerId, subscriptionId });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subscription.id },
        select: { id: true },
      });
      if (user) await revokePremiumPlan(user.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetails = invoice.parent?.subscription_details;
      const subscriptionId =
        typeof subDetails?.subscription === "string"
          ? subDetails.subscription
          : subDetails?.subscription?.id;
      if (subscriptionId) {
        const user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
          select: { id: true },
        });
        if (user) await revokePremiumPlan(user.id);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
