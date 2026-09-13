import { test, expect, type Browser, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir
// `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Hydratation indépendante du fuseau du navigateur (issue #113).
//
// Le serveur rend en UTC, le navigateur dans son fuseau local. Les dates
// « du jour » (éditeur) et de création (projets) étaient formatées sans fuseau
// fixe → rendus différents autour de minuit → erreurs React #425/#422.
//
// Le test ouvre les deux écrans avec un navigateur à UTC+14 (Kiritimati) PUIS
// à UTC-11 (Pago Pago) : quelle que soit l'heure d'exécution, l'un des deux
// est à une date différente de celle du serveur → le défaut serait rattrapé à
// toute heure. On exige zéro erreur d'hydratation et la date de Paris dans le
// champ « date d'émission ».
//
// Secrets : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL
// (.env.local). Absents -> suite SKIPPÉE. ⚠️ `set -a && . ./.env.local && set +a`.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

const TIME_ZONES = ["Pacific/Kiritimati", "Pacific/Pago_Pago"];

const HYDRATION = /hydrat|Minified React error #4(18|19|22|23|25)|did not match/i;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date());
}

async function openInZone(browser: Browser, timezoneId: string) {
  const context = await browser.newContext({ timezoneId });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && HYDRATION.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (HYDRATION.test(e.message)) errors.push(e.message);
  });
  return { context, page, errors };
}

if (!hasEnv) {
  test.describe.skip("Hydratation et fuseau horaire (#113)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Hydratation et fuseau horaire (#113)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-fuseau-${RUN_ID}-Aa1!`;
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let user: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-fuseau-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      user = { id: data.user.id, email: data.user.email! };
      await new Promise((resolve) => setTimeout(resolve, 800));

      const client = await prisma.client.create({
        data: { userId: user.id, name: `Client fuseau ${RUN_ID}` },
        select: { id: true },
      });
      clientId = client.id;
      // Projet créé « maintenant » : sa date de création est affichée sur /projets.
      const project = await prisma.project.create({
        data: { userId: user.id, clientId: client.id, name: `Projet fuseau ${RUN_ID}` },
        select: { id: true },
      });
      projectId = project.id;
    });

    test.afterAll(async () => {
      try {
        if (projectId) await prisma.project.delete({ where: { id: projectId } });
        if (clientId) await prisma.client.delete({ where: { id: clientId } });
      } catch (e) {
        console.warn("Nettoyage échoué :", e);
      }
      await prisma.$disconnect();
      try {
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user échouée :", e);
      }
    });

    for (const timezoneId of TIME_ZONES) {
      test(`éditeur et projets sans erreur d'hydratation (${timezoneId})`, async ({
        browser,
      }) => {
        test.setTimeout(90_000);
        const { context, page, errors } = await openInZone(browser, timezoneId);
        try {
          await loginAs(page, user.email, PASSWORD);

          await page.goto("/projets");
          await expect(page.getByText(`Projet fuseau ${RUN_ID}`).first()).toBeVisible({
            timeout: 15_000,
          });

          await page.goto("/documents/nouveau");
          await expect(page.locator('input[type="date"]').first()).toHaveValue(
            parisToday(),
            { timeout: 15_000 },
          );

          // Laisse le temps à React de signaler une éventuelle divergence.
          await page.waitForTimeout(500);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  });
}
