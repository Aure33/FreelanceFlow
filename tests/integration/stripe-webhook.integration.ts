// Webhook Stripe (issue #82) — SEUL endroit qui accorde/retire le forfait
// Premium. Payloads signés RÉELLEMENT avec `stripe.webhooks.generateTestHeaderString`
// (calcul HMAC local, offline — pas d'appel réseau à Stripe nécessaire) contre
// un secret de test dédié, prouvant une vérification de signature GENUINE
// (pas mockée) : une mauvaise signature/un secret erroné sont réellement
// rejetés par le SDK Stripe, pas par une simulation.
//
// La route est un handler HTTP (POST exporté), appelée ici directement avec
// une vraie NextRequest — aucune session n'est nécessaire (le webhook n'en a
// jamais), donc aucun mock de @/lib/auth/session requis.

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 30_000;
const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_bun_test_only";

function loadDotEnvLocalIfPresent() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnvLocalIfPresent();
// Le webhook réel utilise un secret dédié par endpoint — on force une valeur
// de test connue pour pouvoir signer nous-mêmes des payloads valides.
process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL &&
  !!process.env.STRIPE_SECRET_KEY;

if (!hasEnv) {
  describe.skip("Webhook Stripe (#82)", () => {
    test("secrets Supabase/Stripe absents — cf. .env.local / #17", () => {});
  });
} else {
  const { POST } = await import("@/app/api/stripe/webhook/route");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-wh-${RUN}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-wh-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  async function signedRequest(payload: object): Promise<NextRequest> {
    const body = JSON.stringify(payload);
    // generateTestHeaderStringAsync : le provider crypto par défaut sous Bun
    // (SubtleCrypto/Web Crypto) est asynchrone — la variante sync lève.
    const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: TEST_WEBHOOK_SECRET,
    });
    return new NextRequest("http://localhost:3199/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body,
    });
  }

  function checkoutCompletedEvent(opts: {
    userId: string;
    customerId: string;
    subscriptionId: string;
    mode?: string;
  }) {
    return {
      id: `evt_${randomUUID().slice(0, 12)}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_${randomUUID().slice(0, 12)}`,
          mode: opts.mode ?? "subscription",
          client_reference_id: opts.userId,
          customer: opts.customerId,
          subscription: opts.subscriptionId,
        },
      },
    };
  }

  describe("Webhook Stripe (#82)", () => {
    let userA: { id: string; email: string };

    beforeAll(async () => {
      userA = await createRealUser("a");
      await new Promise((r) => setTimeout(r, 500));
    }, TIMEOUT);

    afterAll(async () => {
      if (userA?.id) {
        await prisma.user.deleteMany({ where: { id: userA.id } });
        await admin.auth.admin.deleteUser(userA.id).catch(() => {});
      }
      await prisma.$disconnect();
    }, TIMEOUT);

    test("signature manquante -> 400, rien muté", async () => {
      const body = JSON.stringify(
        checkoutCompletedEvent({
          userId: userA.id,
          customerId: "cus_x",
          subscriptionId: "sub_x",
        }),
      );
      const req = new NextRequest("http://localhost:3199/api/stripe/webhook", {
        method: "POST",
        body,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true },
      });
      expect(row?.planType).toBe("free");
    }, TIMEOUT);

    test("signature invalide (mauvais secret) -> 400, rien muté", async () => {
      const body = JSON.stringify(
        checkoutCompletedEvent({
          userId: userA.id,
          customerId: "cus_x",
          subscriptionId: "sub_x",
        }),
      );
      const badSignature = await Stripe.webhooks.generateTestHeaderStringAsync({
        payload: body,
        secret: "whsec_completely_wrong_secret",
      });
      const req = new NextRequest("http://localhost:3199/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": badSignature },
        body,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true },
      });
      expect(row?.planType).toBe("free");
    }, TIMEOUT);

    test("checkout.session.completed (subscription) signé -> Premium accordé + ids persistés", async () => {
      const customerId = `cus_test_${RUN}`;
      const subscriptionId = `sub_test_${RUN}`;
      const req = await signedRequest(
        checkoutCompletedEvent({ userId: userA.id, customerId, subscriptionId }),
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: {
          planType: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
        },
      });
      expect(row?.planType).toBe("premium");
      expect(row?.stripeCustomerId).toBe(customerId);
      expect(row?.stripeSubscriptionId).toBe(subscriptionId);
    }, TIMEOUT);

    test("checkout.session.completed mode=payment (pas subscription) -> ignoré", async () => {
      // Repart d'un état free pour isoler cette assertion.
      await prisma.user.update({
        where: { id: userA.id },
        data: { planType: "free", stripeSubscriptionId: null },
      });
      const req = await signedRequest(
        checkoutCompletedEvent({
          userId: userA.id,
          customerId: "cus_y",
          subscriptionId: "sub_y",
          mode: "payment",
        }),
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true },
      });
      expect(row?.planType).toBe("free");
    }, TIMEOUT);

    test("customer.subscription.deleted -> retour au forfait Gratuit", async () => {
      const customerId = `cus_del_${RUN}`;
      const subscriptionId = `sub_del_${RUN}`;
      // État initial : Premium avec ces identifiants Stripe.
      await prisma.user.update({
        where: { id: userA.id },
        data: {
          planType: "premium",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      const req = await signedRequest({
        id: `evt_${randomUUID().slice(0, 12)}`,
        type: "customer.subscription.deleted",
        data: { object: { id: subscriptionId } },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true, stripeSubscriptionId: true, stripeCustomerId: true },
      });
      expect(row?.planType).toBe("free");
      expect(row?.stripeSubscriptionId).toBeNull();
      // Le client Stripe reste rattaché (réutilisable pour un futur abonnement).
      expect(row?.stripeCustomerId).toBe(customerId);
    }, TIMEOUT);

    test("invoice.payment_failed -> retour au forfait Gratuit", async () => {
      const customerId = `cus_fail_${RUN}`;
      const subscriptionId = `sub_fail_${RUN}`;
      await prisma.user.update({
        where: { id: userA.id },
        data: {
          planType: "premium",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
        },
      });

      const req = await signedRequest({
        id: `evt_${randomUUID().slice(0, 12)}`,
        type: "invoice.payment_failed",
        data: {
          object: {
            id: `in_${randomUUID().slice(0, 12)}`,
            parent: { subscription_details: { subscription: subscriptionId } },
          },
        },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true },
      });
      expect(row?.planType).toBe("free");
    }, TIMEOUT);

    test("événement sans utilisateur correspondant -> 200, aucune erreur, rien à muter", async () => {
      const req = await signedRequest({
        id: `evt_${randomUUID().slice(0, 12)}`,
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_does_not_exist" } },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    }, TIMEOUT);

    test("idempotence : rejouer le même événement ne change rien de plus", async () => {
      const customerId = `cus_idem_${RUN}`;
      const subscriptionId = `sub_idem_${RUN}`;
      const event = checkoutCompletedEvent({
        userId: userA.id,
        customerId,
        subscriptionId,
      });

      await POST(await signedRequest(event));
      const res2 = await POST(await signedRequest(event));
      expect(res2.status).toBe(200);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { planType: true, stripeSubscriptionId: true },
      });
      expect(row?.planType).toBe("premium");
      expect(row?.stripeSubscriptionId).toBe(subscriptionId);
    }, TIMEOUT);
  });
}
