import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Cloche de notifications (issue #69) — parcours réel dans le navigateur.
//
// Deux flux impossibles à couvrir en intégration :
//   1. Compte vide → aucun badge, popover « Aucune notification ».
//   2. Compte avec une facture en retard + un devis à relancer (semés en base)
//      → badge de compte, panneau listant les 2 pièces, « Tout marquer comme
//      lu » qui EFFACE le badge (cookie + router.refresh, vrai aller-retour).
//
// A11y vérifiée : le bouton porte aria-haspopup="dialog"/aria-expanded, le
// panneau est role="dialog", Échap le ferme.
//
// Secrets lus depuis .env.local ; suite SKIPPÉE si absents. ⚠️ Projet DEV.

const DAY = 86_400_000;

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

async function signUp(page: Page, email: string, password: string, nom: string) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Notif");
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /créer mon compte/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

if (!hasEnv) {
  test.describe.skip("Notifications (#69)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Notifications — cloche topbar (#69)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-notif-e2e-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-notif-${RUN}-Aa1!`;
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

    test("état vide → aucun badge, puis pièces semées → badge, liste et « tout lu »", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));

      // --- 1. Compte neuf : aucune notification ---
      await signUp(page, EMAIL, PASSWORD, `Bell ${RUN}`);
      const created = await prisma.user.findFirst({
        where: { email: EMAIL },
        select: { id: true },
      });
      userId = created!.id;

      const bell = page.locator("button[aria-haspopup='dialog']");
      // Pas de badge → aria-label sobre.
      await expect(bell).toHaveAttribute("aria-label", "Notifications");
      await bell.click();
      const dialog = page.getByRole("dialog", { name: "Notifications" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Aucune notification/i)).toBeVisible();
      // Échap ferme.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // --- 2. On sème une facture en retard + un devis à relancer ---
      const now = Date.now();
      const client = await prisma.client.create({
        data: { userId, name: "Studio Menhir" },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId, clientId: client.id, name: "Refonte" },
        select: { id: true },
      });
      await prisma.document.create({
        data: {
          userId, projectId: project.id, type: "facture",
          number: `FAC-${RUN}-R`, status: "envoye",
          totalHtCents: 100000, totalTvaCents: 20000, totalTtcCents: 120000,
          emittedAt: new Date(now - 40 * DAY), issuedAt: new Date(now - 40 * DAY),
          dueAt: new Date(now - 12 * DAY),
        },
      });
      await prisma.document.create({
        data: {
          userId, projectId: project.id, type: "devis",
          number: `DEV-${RUN}-S`, status: "envoye",
          totalHtCents: 50000, totalTvaCents: 10000, totalTtcCents: 60000,
          emittedAt: new Date(now - 15 * DAY), issuedAt: new Date(now - 15 * DAY),
        },
      });

      // --- 3. Rechargement : badge « 2 non lues », panneau listant les 2 ---
      await page.reload({ waitUntil: "networkidle" });
      await expect(bell).toHaveAttribute("aria-label", /2 non lues/);
      await bell.click();
      const dialog2 = page.getByRole("dialog", { name: "Notifications" });
      await expect(dialog2.getByText(`FAC-${RUN}-R`, { exact: false })).toBeVisible();
      await expect(dialog2.getByText(`DEV-${RUN}-S`, { exact: false })).toBeVisible();

      // --- 4. « Tout marquer comme lu » → le badge disparaît ---
      await dialog2.getByRole("button", { name: /Tout marquer comme lu/i }).click();
      await expect(bell).toHaveAttribute("aria-label", "Notifications", {
        timeout: 15_000,
      });

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
