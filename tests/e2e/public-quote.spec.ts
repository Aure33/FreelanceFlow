import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes } from "node:crypto";

// Lien public de devis (issue #85) — parcours réels :
//   1. Propriétaire : sur la vue d'un devis émis, « Créer un lien de partage »
//      révèle une URL /proposition/<token>.
//   2. Public (sans compte) : la page /proposition/<token> montre le devis et
//      permet de l'accepter → bannière de confirmation + statut « accepte » en
//      base.
//   3. Jeton invalide → 404 française (#67).
//
// Secrets lus depuis .env.local ; suite SKIPPÉE si absents. ⚠️ Projet DEV.

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

if (!hasEnv) {
  test.describe.skip("Lien public de devis (#85)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Lien public de devis (#85)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-pubq-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-pubq-${RUN}-Aa1!`;
    const prisma = new PrismaClient();
    let userId: string | null = null;
    let quoteOwnerId = ""; // devis pour le parcours propriétaire
    let quotePublicId = ""; // devis avec jeton pré-posé pour le parcours public
    const publicToken = randomBytes(24).toString("base64url");

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(`create user: ${error?.message}`);
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));

      const client = await prisma.client.create({
        data: { userId: userId!, name: "Client Public" },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId: userId!, clientId: client.id, name: "Mission Public" },
        select: { id: true },
      });
      const owner = await prisma.document.create({
        data: {
          userId: userId!, projectId: project.id, type: "devis",
          status: "envoye", number: `DEV-${RUN}-A`,
          object: "Prestation de démonstration",
          totalHtCents: 100000, totalTvaCents: 20000, totalTtcCents: 120000,
          issuedAt: new Date(), emittedAt: new Date(),
        },
        select: { id: true },
      });
      quoteOwnerId = owner.id;
      const pub = await prisma.document.create({
        data: {
          userId: userId!, projectId: project.id, type: "devis",
          status: "envoye", number: `DEV-${RUN}-B`,
          object: "Proposition à valider",
          totalHtCents: 50000, totalTvaCents: 10000, totalTtcCents: 60000,
          issuedAt: new Date(), emittedAt: new Date(),
          publicToken,
        },
        select: { id: true },
      });
      quotePublicId = pub.id;
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

    test("propriétaire : « Créer un lien de partage » révèle l'URL /proposition/", async ({
      page,
    }) => {
      await loginAs(page, EMAIL, PASSWORD);
      await page.goto(`/devis/${quoteOwnerId}`);

      await page
        .getByRole("button", { name: /Créer un lien de partage/i })
        .click();
      const input = page.getByLabel("Lien public");
      await expect(input).toBeVisible();
      await expect(input).toHaveValue(/\/proposition\/.+/);
    });

    test("public (sans compte) : consulter puis accepter le devis", async ({
      page,
    }) => {
      const errors: string[] = [];
      const IGNORED = [/Failed to load resource/i, /404/];
      page.on("console", (m) => {
        if (m.type() === "error" && !IGNORED.some((re) => re.test(m.text())))
          errors.push(m.text());
      });

      await page.goto(`/proposition/${publicToken}`);
      // Le devis est rendu (objet visible) + entête public.
      await expect(page.getByText(/Proposition commerciale/i).first()).toBeVisible();
      await expect(page.getByText("Client Public").first()).toBeVisible();

      // Accepter.
      await page.getByRole("button", { name: /Accepter le devis/i }).click();
      await expect(page.getByText(/Devis accepté/i)).toBeVisible({
        timeout: 15_000,
      });

      // Vérité base : statut passé à « accepte ».
      const row = await prisma.document.findUnique({
        where: { id: quotePublicId },
        select: { status: true },
      });
      expect(row?.status).toBe("accepte");

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });

    test("jeton invalide → 404 française", async ({ page }) => {
      await page.goto("/proposition/ce-jeton-nexiste-pas-1234567890");
      await expect(page.getByText(/introuvable/i).first()).toBeVisible();
    });
  });
}
