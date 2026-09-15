import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir
// `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Rapports cliquables — même principe que le tableau de bord (#106) :
//   ① les 4 indicateurs mènent aux listes filtrées ;
//   ② « Répartition du CA par client » : un client ouvre sa fiche, et
//     « Voir les N clients » ouvre la liste COMPLÈTE (la carte n'en montre
//     que 4), chaque ligne menant à la fiche ;
//   ③ « Délais de paiement par client » : idem.
// Compte Premium avec 6 clients ayant chacun une facture payée cette année.
//
// Secrets : .env.local exporté — absents ⇒ suite SKIPPÉE. Projet Supabase DEV.

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
  test.describe.skip("Rapports cliquables", () => {
    test("secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Rapports cliquables", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-rapc-${RUN_ID}-Aa1!`;
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let user: { id: string; email: string };
    const clients: { id: string; name: string }[] = [];

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-rapc-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(`create user: ${error?.message}`);
      user = { id: data.user.id, email: data.user.email! };
      await new Promise((r) => setTimeout(r, 800));
      await prisma.user.update({ where: { id: user.id }, data: { planType: "premium" } });

      // 6 clients, montants décroissants (C1 le plus gros) ; délais de 5 à 30 j.
      const now = new Date();
      const paidAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      for (let i = 1; i <= 6; i++) {
        const name = `Client rapc ${i} ${RUN_ID}`;
        const client = await prisma.client.create({
          data: { userId: user.id, name },
          select: { id: true },
        });
        clients.push({ id: client.id, name });
        const project = await prisma.project.create({
          data: { userId: user.id, clientId: client.id, name: `Projet ${i}` },
          select: { id: true },
        });
        const ht = (7 - i) * 100_000;
        const issuedAt = new Date(paidAt.getTime() - i * 5 * 86_400_000);
        await prisma.document.create({
          data: {
            userId: user.id, projectId: project.id, type: "facture", status: "paye",
            number: `FAC-RAPC-${RUN_ID}-${i}`, object: "Prestation",
            totalHtCents: ht, totalTvaCents: ht / 5, totalTtcCents: ht + ht / 5,
            issuedAt, emittedAt: issuedAt, paidAt,
          },
        });
      }
    });

    test.afterAll(async () => {
      try {
        await prisma.document.deleteMany({ where: { userId: user.id } });
        await prisma.project.deleteMany({ where: { userId: user.id } });
        await prisma.client.deleteMany({ where: { userId: user.id } });
        await prisma.user.deleteMany({ where: { id: user.id } });
        await admin.auth.admin.deleteUser(user.id);
      } catch {
        /* nettoyage tolérant */
      }
      await prisma.$disconnect();
    });

    test("les indicateurs mènent aux listes filtrées", async ({ page }) => {
      await loginAs(page, user.email, PASSWORD);
      await page.goto("/rapports");
      const kpi = page.getByRole("link", { name: /Taux d'acceptation des devis/ });
      await expect(kpi).toHaveAttribute("href", "/devis?statut=accepte");
      await expect(
        page.getByRole("link", { name: /En attente de paiement/ }),
      ).toHaveAttribute("href", "/factures?statut=envoye");
      await kpi.click();
      await expect(page).toHaveURL(/\/devis\?statut=accepte/, { timeout: 15_000 });
    });

    test("un client de la carte ouvre sa fiche", async ({ page }) => {
      await loginAs(page, user.email, PASSWORD);
      await page.goto("/rapports");
      const section = page.locator("section", { hasText: "Répartition du CA par client" });
      await section.getByRole("link", { name: clients[0].name }).click();
      await expect(page).toHaveURL(new RegExp(`/clients/${clients[0].id}`), {
        timeout: 15_000,
      });
    });

    test("« Voir les 6 clients » ouvre la liste complète, chaque ligne mène à la fiche", async ({
      page,
    }) => {
      await loginAs(page, user.email, PASSWORD);
      await page.goto("/rapports");

      for (const title of ["Répartition du CA par client", "Délais de paiement par client"]) {
        const section = page.locator("section", { hasText: title });
        // La carte n'affiche que 4 clients : le 6e n'y est pas.
        await expect(section.getByRole("link", { name: clients[5].name })).toHaveCount(0);
        // Re-clic anti-course d'hydratation (cf. public-quote.spec.ts).
        const dialog = page.getByRole("dialog", { name: title });
        await expect(async () => {
          if (!(await dialog.isVisible())) {
            await section.getByRole("button", { name: "Voir les 6 clients" }).click({ timeout: 2_000 });
          }
          await expect(dialog).toBeVisible({ timeout: 3_000 });
        }).toPass({ timeout: 30_000 });

        await expect(dialog.getByRole("link")).toHaveCount(6);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
      }

      const section = page.locator("section", { hasText: "Répartition du CA par client" });
      await section.getByRole("button", { name: "Voir les 6 clients" }).click();
      await page
        .getByRole("dialog", { name: "Répartition du CA par client" })
        .getByRole("link", { name: clients[5].name })
        .click();
      await expect(page).toHaveURL(new RegExp(`/clients/${clients[5].id}`), {
        timeout: 15_000,
      });
    });
  });
}
