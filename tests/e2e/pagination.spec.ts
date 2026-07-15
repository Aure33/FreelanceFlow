import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Pagination / tri / filtres (issue #70) — parcours réel dans le navigateur.
//
// On sème 13 clients + 12 factures « en attente », puis on vérifie que l'ÉTAT
// vit dans l'URL (?page=, ?statut=), que la navigation fonctionne au clavier
// (liens réels, pas de handler JS) et que les bornes sont correctes.
//
// Secrets lus depuis .env.local ; suite SKIPPÉE si absents. ⚠️ Projet DEV.

const DAY = 86_400_000;

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

async function signUp(page: Page, email: string, password: string, nom: string) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Pag");
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

if (!hasEnv) {
  test.describe.skip("Pagination (#70)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Pagination / filtres (#70)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-pag-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-pag-${RUN}-Aa1!`;
    const prisma = new PrismaClient();
    let userId: string | null = null;

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

    test("clients + factures : pagination et filtre dans l'URL", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));

      await signUp(page, EMAIL, PASSWORD, `Pag ${RUN}`);
      userId = (await prisma.user.findFirst({
        where: { email: EMAIL },
        select: { id: true },
      }))!.id;

      // Semis : 13 clients (2 pages) + 12 factures « en attente » + 1 brouillon.
      await prisma.client.createMany({
        data: Array.from({ length: 13 }, (_, i) => ({
          userId: userId!,
          name: `Client ${String(i).padStart(2, "0")}`,
        })),
      });
      const c0 = (await prisma.client.findFirst({
        where: { userId },
        select: { id: true },
      }))!.id;
      const project = await prisma.project.create({
        data: { userId, clientId: c0, name: "Projet Pag" },
        select: { id: true },
      });
      const nowMs = Date.now();
      await prisma.document.createMany({
        data: [
          ...Array.from({ length: 12 }, (_, i) => ({
            userId: userId!,
            projectId: project.id,
            type: "facture",
            status: "envoye",
            number: `FAC-2026-${String(i + 1).padStart(3, "0")}`,
            totalHtCents: 100000,
            totalTvaCents: 20000,
            totalTtcCents: 120000,
            issuedAt: new Date(nowMs - (20 - i) * DAY),
            emittedAt: new Date(nowMs - (20 - i) * DAY),
            dueAt: new Date(nowMs + 30 * DAY),
          })),
          {
            userId: userId!,
            projectId: project.id,
            type: "facture",
            status: "brouillon",
            number: null,
            totalHtCents: 0,
            totalTvaCents: 0,
            totalTtcCents: 0,
          },
        ],
      });

      // --- Clients : page 1 = 10 lignes, pagination visible, page 2 = 3 lignes.
      await page.goto("/clients");
      await expect(page.getByText(/Page.*1.*sur.*2.*13 clients au total/i)).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Pagination" });
      await expect(nav.getByText("Précédent")).toBeVisible();

      await page.getByRole("link", { name: "Page suivante" }).click();
      await page.waitForURL(/\/clients\?page=2/);
      // Page 2 : 3 clients (Client 10, 11, 12) → 3 lignes de données.
      await expect(page.getByText("Client 12")).toBeVisible();
      await expect(page.getByText("Client 09")).toHaveCount(0); // resté page 1

      // --- Factures : filtre « En attente » dans l'URL, 12 → 2 pages.
      await page.goto("/factures");
      await page.getByRole("link", { name: /^En attente \d+$/ }).click();
      await page.waitForURL(/\/factures\?statut=envoye/);
      await expect(page.getByText(/12 factures au total/i)).toBeVisible();

      // Le brouillon (statut ≠ envoye) est bien exclu du filtre.
      await expect(
        page.getByRole("row").filter({ hasText: "Brouillon" }),
      ).toHaveCount(0);

      // Suivant → page 2 en conservant le filtre.
      await page.getByRole("link", { name: "Page suivante" }).click();
      await page.waitForURL(/statut=envoye&page=2|page=2&statut=envoye/);

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
