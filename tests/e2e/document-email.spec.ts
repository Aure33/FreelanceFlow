import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Envoi d'un document par e-mail (issue #83) — parcours réel exerçant la
// VRAIE API Resend (PDF Puppeteer + réseau), gated sur RESEND_API_KEY en plus
// des secrets Supabase habituels : SKIPPÉ proprement en CI (secret non
// configuré, cf. .env.local / #17).
//
// Le compte Resend gratuit sans domaine vérifié n'autorise l'envoi QU'À
// l'adresse e-mail du compte lui-même (anti-abus) — inconnue de ce fichier
// (on ne committe pas l'adresse personnelle du mainteneur). On teste donc de
// façon DÉTERMINISTE le chemin d'erreur : un destinataire qui n'est PAS cette
// adresse déclenche TOUJOURS la restriction Resend, prouvant une vraie
// connectivité API + une traduction FR correcte. L'envoi RÉUSSI (destinataire
// = adresse du compte) a été vérifié manuellement lors du développement (PR
// #83, e-mail reçu avec le PDF en pièce jointe).

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL &&
  !!process.env.RESEND_API_KEY;

async function signUp(page: Page, email: string, password: string, nom: string) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Mail");
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

if (!hasEnv) {
  test.describe.skip("Envoi de document par e-mail (#83)", () => {
    test("RESEND_API_KEY ou secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Envoi de document par e-mail (#83)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-mail-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-mail-${RUN}-Aa1!`;
    const prisma = new PrismaClient();
    let userId: string | null = null;

    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage();
      await signUp(page, EMAIL, PASSWORD, `Mail ${RUN}`);
      await page.close();
      userId = (await prisma.user.findFirst({
        where: { email: EMAIL },
        select: { id: true },
      }))!.id;
    });

    test.afterAll(async () => {
      try {
        if (userId) {
          await prisma.document.deleteMany({ where: { userId } });
          await prisma.project.deleteMany({ where: { userId } });
          await prisma.client.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
          await admin.auth.admin.deleteUser(userId);
        }
      } catch {
        /* nettoyage tolérant */
      }
      await prisma.$disconnect();
    });

    test("brouillon : le bloc d'envoi n'apparaît pas", async ({ page }) => {
      await loginAs(page, EMAIL, PASSWORD);

      const client = await prisma.client.create({
        data: { userId: userId!, name: "Client Mail" },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId: userId!, clientId: client.id, name: "Projet Mail" },
        select: { id: true },
      });
      const draft = await prisma.document.create({
        data: {
          userId: userId!, projectId: project.id, type: "facture", status: "brouillon",
          totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0,
        },
        select: { id: true },
      });

      // Le brouillon passe par l'éditeur, pas la vue document — mais si un
      // brouillon existait à cette URL, le bloc « Envoyer par e-mail » ne doit
      // de toute façon jamais s'y afficher (garde côté UI, cf. document-view.tsx).
      await page.goto(`/factures/${draft.id}`).catch(() => {});
      await expect(page.getByText("Envoyer par e-mail")).toHaveCount(0);
    });

    test("émis : destinataire non autorisé (palier gratuit) → erreur FR déterministe", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));

      await loginAs(page, EMAIL, PASSWORD);

      const client = await prisma.client.create({
        data: { userId: userId!, name: "Client Mail 2" },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId: userId!, clientId: client.id, name: "Projet Mail 2" },
        select: { id: true },
      });
      const doc = await prisma.document.create({
        data: {
          userId: userId!, projectId: project.id, type: "facture", status: "envoye",
          number: `FAC-${RUN}-E2E`, object: "Test envoi",
          totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000,
          issuedAt: new Date(), emittedAt: new Date(),
        },
        select: { id: true },
      });

      await page.goto(`/factures/${doc.id}`);
      const section = page.locator("section", { hasText: "Envoyer par e-mail" });
      await expect(section).toBeVisible();

      // Un domaine réaliste (pas example.com, que Resend rejette par un AUTRE
      // garde-fou générique avant même la vérification de propriétaire).
      await section.getByLabel("Adresse du client").fill(`not-the-owner-${RUN}@gmail.com`);
      await section.getByRole("button", { name: /^Envoyer$/i }).click();

      // Réponse RÉELLE de l'API Resend : peut prendre plusieurs secondes
      // (génération PDF Puppeteer + appel réseau).
      await expect(section.getByRole("alert")).toBeVisible({ timeout: 45_000 });
      await expect(section.getByRole("alert")).toContainText(/Mode démo/i);

      // Rien persisté en base (l'envoi a échoué).
      const row = await prisma.document.findUnique({
        where: { id: doc.id },
        select: { emailSentAt: true },
      });
      expect(row?.emailSentAt).toBeNull();

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
