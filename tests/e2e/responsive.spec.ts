import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Version responsive (issue #96) — l'application est utilisable sur mobile.
//
// Viewport 390×844 (iPhone 13). Deux garanties :
//   1. ZÉRO débordement horizontal (`scrollWidth ≤ clientWidth`) sur toutes
//      les pages du shell + pages publiques — c'est la définition mesurable
//      du critère d'acceptation, celle qui avait été violée (jusqu'à +493 px
//      constatés avant correctif) ;
//   2. le TIROIR de navigation mobile fonctionne et est accessible :
//      aria-expanded, ouverture, fermeture par Échap (focus rendu au bouton),
//      fermeture automatique après navigation.
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

// Débordement horizontal du document (0 = aucune barre de scroll page).
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

if (!hasEnv) {
  test.describe.skip("Responsive mobile (#96)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe("Responsive mobile (#96)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-resp-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-resp-${RUN}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let userId = "";
    let clientId = "";
    let projectId = "";
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

      // Données réelles pour que les pages aient du contenu à déborder
      // (tables, fiches, graphes) — pas des écrans vides trop faciles.
      const client = await prisma.client.create({
        data: { userId, name: `Client Responsive ${RUN}` },
        select: { id: true },
      });
      clientId = client.id;
      const project = await prisma.project.create({
        data: { userId, clientId, name: `Projet Responsive ${RUN}` },
        select: { id: true },
      });
      projectId = project.id;
      const doc = await prisma.document.create({
        data: {
          userId,
          projectId,
          type: "facture",
          status: "envoye",
          number: `FAC-RESP-${RUN}`,
          object: "Facture responsive avec un objet assez long",
          totalHtCents: 250_000,
          totalTvaCents: 50_000,
          totalTtcCents: 300_000,
          issuedAt: new Date(),
          emittedAt: new Date(),
          dueAt: new Date(Date.now() + 30 * 86_400_000),
        },
        select: { id: true },
      });
      invoiceId = doc.id;
      await prisma.documentLine.create({
        data: {
          userId,
          documentId: invoiceId,
          label: "Développement front — libellé volontairement long",
          quantity: 5,
          unitPriceCents: 50_000,
          tvaRate: 20,
          position: 0,
        },
      });
    });

    test.afterAll(async () => {
      try {
        if (userId) {
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

    test("zéro débordement horizontal sur toutes les pages (shell + publiques)", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, EMAIL, PASSWORD);

      const appPages = [
        "/dashboard",
        "/clients",
        "/clients/nouveau",
        `/clients/${clientId}`,
        "/projets",
        `/projets/${projectId}`,
        "/devis",
        "/factures",
        `/factures/${invoiceId}`,
        "/documents/nouveau",
        "/rapports",
        "/abonnement",
        "/parametres",
      ];
      for (const path of appPages) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(
          await horizontalOverflow(page),
          `débordement horizontal sur ${path}`,
        ).toBeLessThanOrEqual(0);
      }

      // Pages publiques, sans session.
      await page.context().clearCookies();
      for (const path of ["/", "/legal", "/connexion", "/inscription"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(
          await horizontalOverflow(page),
          `débordement horizontal sur ${path}`,
        ).toBeLessThanOrEqual(0);
      }

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });

    test("tiroir de navigation : ouverture, Échap (focus rendu), navigation ferme", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, EMAIL, PASSWORD);

      // Fermé par défaut : le bouton annonce l'ouverture.
      const openBtn = page.getByRole("button", { name: "Ouvrir la navigation" });
      await expect(openBtn).toBeVisible();
      await expect(openBtn).toHaveAttribute("aria-expanded", "false");

      // Ouverture : la sidebar devient visible, le bouton annonce la fermeture.
      await openBtn.click();
      const closeBtn = page.getByRole("button", { name: "Fermer la navigation" });
      await expect(closeBtn).toHaveAttribute("aria-expanded", "true");
      const factLink = page.getByRole("link", { name: /Factures/ });
      await expect(factLink).toBeVisible();

      // Échap ferme et rend le focus au bouton menu.
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Ouvrir la navigation" }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(
        page.getByRole("button", { name: "Ouvrir la navigation" }),
      ).toBeFocused();
      await expect(factLink).not.toBeVisible();

      // Naviguer depuis le tiroir le referme automatiquement.
      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
      await page.getByRole("link", { name: /Factures/ }).click();
      await page.waitForURL(/\/factures/);
      await expect(
        page.getByRole("button", { name: "Ouvrir la navigation" }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByText(`FAC-RESP-${RUN}`).first()).toBeVisible();

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
