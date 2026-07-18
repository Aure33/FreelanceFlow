import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Relances automatiques (issue #84) — parcours réel des Paramètres.
//
// La carte « Relances automatiques » (#12, décorative jusqu'ici) persiste
// désormais ses réglages : un utilisateur Premium modifie paliers + ton,
// enregistre, recharge la page → les valeurs tiennent (vérité BASE en plus via
// Prisma). La route cron, elle, refuse toute requête sans le Bearer CRON_SECRET
// (le bilan 200 est couvert en intégration — le secret n'est pas partagé ici).
//
// Secrets : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL (lus
// depuis .env.local). Absents -> suite SKIPPÉE proprement. ⚠️ Projet DEV.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const IGNORED = [/favicon/i, /Failed to load resource/i];
  const isIgnored = (msg: string) => IGNORED.some((re) => re.test(msg));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isIgnored(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    if (!isIgnored(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

if (!hasEnv) {
  test.describe.skip("Relances automatiques (#84)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe("Relances automatiques (#84)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-reminders-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-rem-${RUN}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let userId = "";

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(error?.message);
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));
      // Premium : la carte affiche la copie « incluse dans votre forfait ».
      await prisma.user.update({
        where: { id: userId },
        data: { planType: "premium" },
      });
    });

    test.afterAll(async () => {
      if (userId) {
        await prisma.user.deleteMany({ where: { id: userId } });
        await admin.auth.admin.deleteUser(userId).catch(() => {});
      }
      await prisma.$disconnect();
    });

    test("réglages : activer, choisir paliers + ton, enregistrer → les valeurs tiennent au reload (et en base)", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, EMAIL, PASSWORD);
      await page.goto("/parametres#relances");

      const toggle = page.getByLabel("Activer les relances automatiques");
      await expect(toggle).toBeVisible();
      // Défaut : désactivé (migration : reminders_enabled = false).
      await expect(toggle).not.toBeChecked();
      await toggle.check({ force: true }); // input custom recouvert par le rail stylisé

      await page.locator("#rel-first").selectOption("3");
      await page.locator("#rel-second").selectOption("21");
      await page.locator("#rel-last").selectOption("45");
      await page.getByRole("button", { name: "Ferme", exact: true }).click();
      // L'aperçu (aria-live) suit le ton choisi.
      await expect(page.getByText(/L441-10/)).toBeVisible();

      const saveBtn = page
        .locator("section#relances")
        .getByRole("button", { name: "Enregistrer" });
      // CI : re-clic anti-course d'hydratation (cf. playwright.config retries).
      await expect(async () => {
        await saveBtn.click({ timeout: 2_000 });
        await expect(
          page.locator("section#relances").getByText("Enregistré.", { exact: true }),
        ).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });

      // Vérité base.
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          remindersEnabled: true,
          reminderFirstDays: true,
          reminderSecondDays: true,
          reminderFinalDays: true,
          reminderTone: true,
        },
      });
      expect(row).toEqual({
        remindersEnabled: true,
        reminderFirstDays: 3,
        reminderSecondDays: 21,
        reminderFinalDays: 45,
        reminderTone: "ferme",
      });

      // Reload : l'UI relit les valeurs persistées.
      await page.reload();
      await expect(
        page.getByLabel("Activer les relances automatiques"),
      ).toBeChecked();
      await expect(page.locator("#rel-first")).toHaveValue("3");
      await expect(page.locator("#rel-second")).toHaveValue("21");
      await expect(page.locator("#rel-last")).toHaveValue("45");
      await expect(
        page.getByRole("button", { name: "Ferme", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });

    test("route cron : 401 sans Bearer et avec un mauvais Bearer", async ({
      request,
    }) => {
      const noAuth = await request.get("/api/cron/relances");
      expect(noAuth.status()).toBe(401);

      const badAuth = await request.get("/api/cron/relances", {
        headers: { authorization: "Bearer mauvais-secret" },
      });
      expect(badAuth.status()).toBe(401);
    });
  });
}
