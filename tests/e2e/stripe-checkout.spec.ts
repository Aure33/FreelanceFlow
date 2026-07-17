import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Checkout Stripe (issue #82) — parcours réel jusqu'à la redirection vers
// Stripe. Le clic « Passer en Premium » ouvre une VRAIE session Checkout
// (mode test) et navigue réellement vers checkout.stripe.com.
//
// ⚠️ Le paiement n'est PAS complété ici : Stripe ne peut pas livrer son
// webhook à `localhost` (serveur de test Playwright, non joignable depuis
// Internet) — la boucle paiement → webhook → Premium a été vérifiée
// manuellement en RÉEL contre l'URL de production (carte de test 4242…,
// webhook livré, `planType` passé à "premium" en base, puis nettoyage —
// cf. description de la PR #82). Ce test couvre ce qui EST reproductible en
// CI : l'ouverture d'une session Checkout authentique.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL &&
  !!process.env.STRIPE_SECRET_KEY &&
  !!process.env.STRIPE_PRICE_MONTHLY;

async function signUp(page: Page, email: string, password: string, nom: string) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Stripe");
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

if (!hasEnv) {
  test.describe.skip("Checkout Stripe (#82)", () => {
    test("secrets Supabase/Stripe absents — cf. .env.local / #17", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Checkout Stripe (#82)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-checkout-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-checkout-${RUN}-Aa1!`;
    const prisma = new PrismaClient();
    let userId: string | null = null;
    let stripeCustomerId: string | null = null;

    test.afterAll(async () => {
      try {
        if (userId) {
          if (stripeCustomerId) {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
            await stripe.customers.del(stripeCustomerId).catch(() => {});
          }
          await prisma.user.deleteMany({ where: { id: userId } });
          await admin.auth.admin.deleteUser(userId);
        }
      } catch {
        /* nettoyage tolérant */
      }
      await prisma.$disconnect();
    });

    test("« Passer en Premium » ouvre une vraie session Checkout Stripe", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));

      await signUp(page, EMAIL, PASSWORD, `Checkout ${RUN}`);
      userId = (await prisma.user.findFirst({
        where: { email: EMAIL },
        select: { id: true },
      }))!.id;

      await page.goto("/abonnement");
      await page.getByRole("button", { name: /Passer en Premium/i }).click();

      // Navigation RÉELLE hors origine, vers le domaine Stripe.
      await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {
        timeout: 20_000,
      });
      expect(page.url()).toContain("checkout.stripe.com");

      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });
      expect(row?.stripeCustomerId).toBeTruthy();
      stripeCustomerId = row!.stripeCustomerId!;

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
