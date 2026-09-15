import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// Liens légaux accessibles partout (LCEN, art. 6) : les mentions légales, les CGU
// et la politique de confidentialité doivent être atteignables depuis le pied de
// page public ET depuis l'application connectée (barre latérale).

const legalNav = (page: Page) =>
  page.getByRole("navigation", { name: "Liens légaux" });

async function expectMentionsPage(page: Page) {
  await page.waitForURL(/\/legal#mentions$/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /Éditeur du site/ }),
  ).toBeVisible({ timeout: 15_000 });
}

test("accueil : le pied de page mène aux mentions légales", async ({ page }) => {
  await page.goto("/");
  const nav = legalNav(page);
  for (const name of ["Mentions légales", "CGU", "Confidentialité"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await nav.getByRole("link", { name: "Mentions légales", exact: true }).click();
  await expectMentionsPage(page);
});

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;

if (!hasEnv) {
  test.describe.skip("Liens légaux connecté", () => {
    test("secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  test.describe("Liens légaux connecté", () => {
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-legal-${RUN_ID}-Aa1!`;
    const EMAIL = `test-legal-${RUN_ID}@freelanceflow.test`;
    let userId: string | null = null;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création utilisateur : ${error?.message}`);
      }
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));
    });

    test.afterAll(async () => {
      try {
        if (userId) await admin.auth.admin.deleteUser(userId);
      } catch (e) {
        console.warn("Nettoyage user liens légaux échoué :", e);
      }
    });

    test("application connectée : la barre latérale mène aux mentions légales", async ({
      page,
    }) => {
      await page.goto("/connexion");
      await page.getByLabel("Adresse e-mail").fill(EMAIL);
      await page.getByLabel("Mot de passe").fill(PASSWORD);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

      const link = legalNav(page).getByRole("link", {
        name: "Mentions légales",
        exact: true,
      });
      await expect(link).toBeVisible({ timeout: 15_000 });
      await link.click();
      await expectMentionsPage(page);
    });
  });
}
