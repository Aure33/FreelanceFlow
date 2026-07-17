// Session Checkout Stripe (issue #82) contre la VRAIE API Stripe en MODE
// TEST (pas de mock — créer un Customer/une Session est rapide et gratuit en
// mode test, et prouve une intégration réelle plutôt qu'un plomberie mockée).
// Aucun paiement n'a lieu ici (aucune carte saisie) : seule l'ouverture de la
// session est testée. Nettoyage des clients Stripe créés en afterAll.
//
// `createCheckoutSessionCore` est appelée DIRECTEMENT (pas
// `createCheckoutSession`) pour éviter de mocker next/headers, dont
// notifications.integration.ts fournit un mock INCOMPATIBLE (cf. #68/#83).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 30_000;

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

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL &&
  !!process.env.STRIPE_SECRET_KEY &&
  !!process.env.STRIPE_PRICE_MONTHLY;

if (!hasEnv) {
  describe.skip("Checkout Stripe (#82)", () => {
    test("secrets Supabase/Stripe absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  const { createCheckoutSessionCore } = await import(
    "@/app/(app)/abonnement/actions"
  );

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-stripe-${RUN}-Aa1!`;
  const CTX = { origin: "http://localhost:3199" };
  const createdCustomerIds: string[] = [];

  async function createRealUser(slug: string) {
    const email = `test-stripe-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  describe("Checkout Stripe (#82)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 500));
    }, TIMEOUT);

    afterAll(async () => {
      for (const id of createdCustomerIds) {
        await stripe.customers.del(id).catch(() => {});
      }
      for (const u of [userA, userB]) {
        if (!u?.id) continue;
        await prisma.user.deleteMany({ where: { id: u.id } });
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
      await prisma.$disconnect();
    }, TIMEOUT);

    test("ouvre une vraie session Checkout Stripe (mode subscription)", async () => {
      activeUserId = userA.id;
      const res = await createCheckoutSessionCore("mois", CTX);

      expect("url" in res).toBe(true);
      const url = (res as { url: string }).url;
      expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

      const row = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { stripeCustomerId: true },
      });
      expect(row?.stripeCustomerId).toBeTruthy();
      createdCustomerIds.push(row!.stripeCustomerId!);
    }, TIMEOUT);

    test("réutilise le MÊME client Stripe d'une tentative à l'autre", async () => {
      activeUserId = userA.id;
      const before = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { stripeCustomerId: true },
      });

      await createCheckoutSessionCore("an", CTX);

      const after = await prisma.user.findUnique({
        where: { id: userA.id },
        select: { stripeCustomerId: true },
      });
      expect(after?.stripeCustomerId).toBe(before!.stripeCustomerId!);
    }, TIMEOUT);

    test("isolation : deux utilisateurs obtiennent deux clients Stripe distincts", async () => {
      activeUserId = userB.id;
      await createCheckoutSessionCore("mois", CTX);

      const [a, b] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userA.id },
          select: { stripeCustomerId: true },
        }),
        prisma.user.findUnique({
          where: { id: userB.id },
          select: { stripeCustomerId: true },
        }),
      ]);
      expect(a?.stripeCustomerId).toBeTruthy();
      expect(b?.stripeCustomerId).toBeTruthy();
      expect(a?.stripeCustomerId).not.toBe(b?.stripeCustomerId);
      createdCustomerIds.push(b!.stripeCustomerId!);
    }, TIMEOUT);
  });
}
