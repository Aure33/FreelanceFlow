import { test, expect, type Page, type Locator } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir
// `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Annuler un changement de statut (issue #107) — un clic malheureux ne doit pas
// être définitif :
//   ① facture payée → « Annuler le paiement » → de nouveau « En attente »,
//     « Marquer comme payé » redevient actif, la date de paiement disparaît ;
//   ② devis accepté → « Remettre en attente de réponse » → « Envoyé » ;
//   ③ devis déjà converti en facture (#61) : aucune annulation proposée,
//     accepter/refuser désactivés (garde serveur doublée côté interface).
//
// Secrets : .env.local exporté — absents ⇒ suite SKIPPÉE. Projet Supabase DEV.
// Nettoyage en afterAll. Pages streamées (#56) : on asserte le rendu.
//
// HYDRATATION : un clic peut partir avant que le gestionnaire React soit
// attaché (course observée sur runner CI, #82) — les clics de statut sont donc
// rejoués jusqu'à observer l'effet (toPass), sans jamais double-cliquer.

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
  const IGNORED = [/favicon/i, /Failed to load resource|404/];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !IGNORED.some((re) => re.test(msg.text()))) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// Clique `trigger` tant que l'effet attendu (`done`) n'est pas observé.
async function clickUntil(trigger: Locator, done: Locator) {
  await expect(async () => {
    if (await trigger.isVisible()) await trigger.click({ timeout: 2_000 });
    await expect(done).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

if (!hasEnv) {
  test.describe.skip("Annuler un changement de statut (#107)", () => {
    test("secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Annuler un changement de statut (#107)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-undo-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };
    let paidInvoiceId = "";
    let acceptedQuoteId = "";
    let convertedQuoteId = "";

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-undo-e2e-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(`createUser: ${error?.message}`);
      user = { id: data.user.id, email: data.user.email! };
      await new Promise((r) => setTimeout(r, 800));

      const client = await prisma.client.create({
        data: { userId: user.id, name: `Client undo ${RUN_ID}` },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId: user.id, clientId: client.id, name: `Projet undo ${RUN_ID}` },
        select: { id: true },
      });
      const now = new Date();
      const base = {
        userId: user.id,
        projectId: project.id,
        tvaRegime: "reel",
        issuedAt: now,
        emittedAt: now,
        // Échéance future : après annulation, la facture est « En attente ».
        dueAt: new Date(now.getTime() + 30 * 86400_000),
        totalHtCents: 10_000,
        totalTvaCents: 2_000,
        totalTtcCents: 12_000,
      };
      const line = {
        create: [
          {
            userId: user.id,
            label: `Prestation ${RUN_ID}`,
            quantity: 1,
            unitPriceCents: 10_000,
            tvaRate: 20,
            position: 0,
          },
        ],
      };

      paidInvoiceId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "facture",
            status: "paye",
            paidAt: now,
            number: `FAC-UNDO-${RUN_ID}`,
            lines: line,
          },
          select: { id: true },
        })
      ).id;
      acceptedQuoteId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "devis",
            status: "accepte",
            number: `DEV-UNDO-${RUN_ID}-1`,
            lines: line,
          },
          select: { id: true },
        })
      ).id;
      convertedQuoteId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "devis",
            status: "accepte",
            number: `DEV-UNDO-${RUN_ID}-2`,
            lines: line,
          },
          select: { id: true },
        })
      ).id;
      await prisma.document.create({
        data: {
          userId: user.id,
          projectId: project.id,
          type: "facture",
          status: "brouillon",
          sourceQuoteId: convertedQuoteId,
        },
      });
    });

    test.afterAll(async () => {
      try {
        if (user?.id) {
          await prisma.document.deleteMany({
            where: { userId: user.id, sourceQuoteId: { not: null } },
          });
          await prisma.document.deleteMany({ where: { userId: user.id } });
          await prisma.project.deleteMany({ where: { userId: user.id } });
          await prisma.client.deleteMany({ where: { userId: user.id } });
        }
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

    test("① facture payée : « Annuler le paiement » la remet en attente", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/factures/${paidInvoiceId}`);

      const undo = page.getByRole("button", { name: "Annuler le paiement" });
      await expect(undo).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Payée le")).toBeVisible();

      const markPaid = page.getByRole("button", { name: "Marquer comme payé" });
      await clickUntil(undo, markPaid);

      await expect(markPaid).toBeEnabled();
      await expect(undo).toHaveCount(0);
      await expect(page.getByText("Payée le")).toHaveCount(0);

      // Persisté en base (pas seulement à l'écran).
      await expect
        .poll(async () =>
          prisma.document.findUnique({
            where: { id: paidInvoiceId },
            select: { status: true, paidAt: true },
          }),
        )
        .toEqual({ status: "envoye", paidAt: null });
      expect(errors).toEqual([]);
    });

    test("② devis accepté : « Remettre en attente de réponse »", async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/devis/${acceptedQuoteId}`);

      const undo = page.getByRole("button", {
        name: "Remettre en attente de réponse",
      });
      await expect(undo).toBeVisible({ timeout: 15_000 });

      const markAccepted = page.getByRole("button", {
        name: "Marquer comme accepté",
      });
      await clickUntil(undo, markAccepted);
      await expect(markAccepted).toBeEnabled();
      await expect(undo).toHaveCount(0);

      await expect
        .poll(async () =>
          (
            await prisma.document.findUnique({
              where: { id: acceptedQuoteId },
              select: { status: true },
            })
          )?.status,
        )
        .toBe("envoye");
      expect(errors).toEqual([]);
    });

    test("③ devis converti : décision figée, aucune annulation proposée", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/devis/${convertedQuoteId}`);

      await expect(
        page.getByRole("link", { name: "Voir le brouillon de facture" }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: "Remettre en attente de réponse" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Devis accepté" })).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Marquer comme refusé" }),
      ).toBeDisabled();
      expect(errors).toEqual([]);
    });
  });
}
