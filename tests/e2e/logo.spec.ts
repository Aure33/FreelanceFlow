import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Logo d'entreprise (issue #87) — parcours réel complet contre le vrai bucket :
//   1. compte FREE : le bouton d'upload est désactivé (fonctionnalité Premium) ;
//   2. compte PREMIUM : upload d'un vrai PNG via la carte Identité → aperçu ;
//   3. l'en-tête A4 de la vue facture affiche le logo (URL signée /object/sign/) ;
//   4. suppression → retour au fallback (avatar initiales), l'A4 n'a plus d'img.
//
// L'isolation RLS du bucket est couverte par logo-storage.integration.ts.
//
// Secrets : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL (lus
// depuis .env.local). Absents -> suite SKIPPÉE proprement. ⚠️ Projet DEV.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// PNG 1×1 valide.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
  test.describe.skip("Logo d'entreprise (#87)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Logo d'entreprise (#87)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-logo-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-logo-${RUN}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let userId = "";
    let invoiceId = "";

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(error?.message);
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));

      // Une facture émise pour vérifier l'en-tête A4.
      const client = await prisma.client.create({
        data: { userId, name: `Client Logo ${RUN}` },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId, clientId: client.id, name: `Projet Logo ${RUN}` },
        select: { id: true },
      });
      const doc = await prisma.document.create({
        data: {
          userId,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: `FAC-LOGO-${RUN}`,
          object: "Facture avec logo",
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          issuedAt: new Date(),
          emittedAt: new Date(),
          dueAt: new Date(Date.now() + 30 * 86_400_000),
        },
        select: { id: true },
      });
      invoiceId = doc.id;
    });

    test.afterAll(async () => {
      try {
        if (userId) {
          await admin.storage
            .from("logos")
            .remove([`${userId}/logo.png`])
            .catch(() => {});
          await prisma.documentLine.deleteMany({ where: { userId } });
          await prisma.document.deleteMany({ where: { userId } });
          await prisma.project.deleteMany({ where: { userId } });
          await prisma.client.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
          await admin.auth.admin.deleteUser(userId).catch(() => {});
        }
      } catch {
        /* nettoyage tolérant */
      }
      await prisma.$disconnect();
    });

    test("compte free : le bouton d'upload est désactivé (Premium)", async ({
      page,
    }) => {
      await loginAs(page, EMAIL, PASSWORD);
      await page.goto("/parametres");

      const btn = page.getByRole("button", { name: /Ajouter votre logo/ });
      await expect(btn).toBeVisible();
      await expect(btn).toBeDisabled();
      await expect(page.getByText("Réservé au forfait Premium", { exact: false }).first()).toBeVisible();
    });

    test("premium : upload PNG réel → aperçu carte, logo sur l'A4, suppression → fallback", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await prisma.user.update({
        where: { id: userId },
        data: { planType: "premium" },
      });

      await loginAs(page, EMAIL, PASSWORD);
      await page.goto("/parametres");

      // Upload direct via l'input caché (le bouton visible ne fait que le
      // déclencher) — vrai fichier PNG.
      await page
        .getByLabel("Choisir un fichier de logo")
        .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX });
      const preview = page.getByRole("img", { name: "Logo de votre entreprise" });
      await expect(preview).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /Remplacer votre logo/ }),
      ).toBeVisible();

      // En-tête A4 : l'image chargée vient bien d'une URL SIGNÉE du bucket.
      await page.goto(`/factures/${invoiceId}`);
      await expect(page.getByText(`FAC-LOGO-${RUN}`).first()).toBeVisible();
      const a4Logo = page.locator('img[src*="/object/sign/"]');
      await expect(a4Logo).toBeVisible();

      // Suppression → fallback : plus d'aperçu dans la carte, plus d'img A4.
      await page.goto("/parametres");
      await page.getByRole("button", { name: "Supprimer le logo" }).click();
      await expect(preview).toBeHidden({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /Ajouter votre logo/ }),
      ).toBeVisible();

      await page.goto(`/factures/${invoiceId}`);
      await expect(page.getByText(`FAC-LOGO-${RUN}`).first()).toBeVisible();
      await expect(page.locator('img[src*="/object/sign/"]')).toHaveCount(0);

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
