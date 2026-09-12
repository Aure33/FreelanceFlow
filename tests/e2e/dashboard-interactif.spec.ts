import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir
// `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Tableau de bord interactif (issue #106). Chaque élément mène à ce qu'il
// représente :
//   ① les 4 indicateurs → listes filtrées existantes (#70) ;
//   ② « Factures récentes » : un clic HORS de la colonne « Pièce » (sur le
//     client) ouvre la facture — avant, seule la première cellule l'était ;
//   ③ « À traiter en priorité » : la facture en retard et le devis à relancer
//     ouvrent leur vue ;
//   ④ « Top clients » : le client ouvre sa fiche.
//
// Secrets : .env.local exporté (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL) — absents ⇒ suite SKIPPÉE. Projet Supabase DEV. Nettoyage en
// afterAll. Pages streamées (#56) : on asserte le rendu/l'URL, jamais un statut.

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

if (!hasEnv) {
  test.describe.skip("Tableau de bord interactif (#106)", () => {
    test("secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Tableau de bord interactif (#106)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-dash-${RUN_ID}-Aa1!`;
    const CLIENT_NAME = `Client dash ${RUN_ID}`;
    const OVERDUE_NUMBER = `FAC-DASH-${RUN_ID}-R`;
    const QUOTE_NUMBER = `DEV-DASH-${RUN_ID}`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };
    let clientId = "";
    let paidId = "";
    let overdueId = "";
    let quoteId = "";

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-dash-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(`createUser: ${error?.message}`);
      user = { id: data.user.id, email: data.user.email! };
      await new Promise((r) => setTimeout(r, 800));

      const client = await prisma.client.create({
        data: { userId: user.id, name: CLIENT_NAME },
        select: { id: true },
      });
      clientId = client.id;
      const project = await prisma.project.create({
        data: { userId: user.id, clientId, name: `Projet dash ${RUN_ID}` },
        select: { id: true },
      });

      const now = new Date();
      const day = 86400_000;
      const base = {
        userId: user.id,
        projectId: project.id,
        tvaRegime: "reel",
        totalHtCents: 10_000,
        totalTvaCents: 2_000,
        totalTtcCents: 12_000,
      };
      // Facture payée ce mois-ci (KPI encaissé + top clients + récentes).
      paidId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "facture",
            status: "paye",
            number: `FAC-DASH-${RUN_ID}-P`,
            issuedAt: now,
            emittedAt: new Date(now.getTime() - 2 * day),
            dueAt: new Date(now.getTime() + 30 * day),
            paidAt: now,
          },
          select: { id: true },
        })
      ).id;
      // Facture en retard (panneau priorité + récentes, la plus récente).
      overdueId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "facture",
            status: "envoye",
            number: OVERDUE_NUMBER,
            issuedAt: now,
            emittedAt: now,
            dueAt: new Date(now.getTime() - 5 * day),
          },
          select: { id: true },
        })
      ).id;
      // Devis envoyé (panneau priorité « à relancer »).
      quoteId = (
        await prisma.document.create({
          data: {
            ...base,
            type: "devis",
            status: "envoye",
            number: QUOTE_NUMBER,
            issuedAt: now,
            emittedAt: new Date(now.getTime() - 10 * day),
            dueAt: new Date(now.getTime() + 20 * day),
          },
          select: { id: true },
        })
      ).id;
    });

    test.afterAll(async () => {
      try {
        if (user?.id) {
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

    test("① les 4 indicateurs mènent aux listes filtrées", async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);

      const expected: [RegExp, string][] = [
        [/Chiffre d'affaires encaissé/, "/factures?statut=paye"],
        [/Factures en attente/, "/factures?statut=envoye"],
        [/En retard de paiement/, "/factures?statut=en_retard"],
        [/Devis à relancer/, "/devis?statut=envoye"],
      ];
      for (const [name, href] of expected) {
        await expect(page.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
      }

      await page.getByRole("link", { name: /En retard de paiement/ }).click();
      await page.waitForURL(/\/factures\?statut=en_retard/, { timeout: 15_000 });
      await expect(
        page.getByRole("row").filter({ hasText: OVERDUE_NUMBER }),
      ).toBeVisible({ timeout: 15_000 });
      expect(errors).toEqual([]);
    });

    test("② factures récentes : un clic sur le client ouvre la facture", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);

      const table = page.getByRole("region", {
        name: "Factures récentes (tableau défilable)",
      });
      const row = table.getByRole("row").filter({ hasText: OVERDUE_NUMBER });
      // Clic souris aux coordonnées de la cellule CLIENT (pas « Pièce ») :
      // c'est le lien en absolu qui reçoit le clic, comme pour un utilisateur.
      // (locator.click() refuserait : il détecte justement que le lien
      // « intercepte » le pointeur — preuve du recouvrement.)
      const cell = row.getByRole("cell", { name: CLIENT_NAME });
      await expect(cell).toBeVisible({ timeout: 15_000 });
      // Le tableau est en bas de page : coordonnées valides seulement à l'écran.
      await cell.scrollIntoViewIfNeeded();
      const box = await cell.boundingBox();
      if (!box) throw new Error("cellule client sans boîte");
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForURL(new RegExp(`/factures/${overdueId}$`), {
        timeout: 15_000,
        waitUntil: "commit",
      });
      expect(errors).toEqual([]);
    });

    test("③ à traiter en priorité : facture en retard et devis ouvrent leur vue", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);

      const overdueLink = page.getByRole("link", {
        name: `Ouvrir la facture ${OVERDUE_NUMBER} — ${CLIENT_NAME}`,
      });
      await expect(overdueLink).toHaveAttribute("href", `/factures/${overdueId}`);
      const quoteLink = page.getByRole("link", {
        name: `Ouvrir le devis ${QUOTE_NUMBER} — ${CLIENT_NAME}`,
      });
      await expect(quoteLink).toHaveAttribute("href", `/devis/${quoteId}`);

      await quoteLink.click();
      await page.waitForURL(new RegExp(`/devis/${quoteId}$`), {
        timeout: 15_000,
      });
      expect(errors).toEqual([]);
    });

    test("④ top clients : le client ouvre sa fiche", async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, user.email, PASSWORD);

      const link = page.getByRole("link", {
        name: new RegExp(`^Ouvrir la fiche ${CLIENT_NAME} — \\d+ %$`),
      });
      await expect(link).toHaveAttribute("href", `/clients/${clientId}`);
      await link.click();
      await page.waitForURL(new RegExp(`/clients/${clientId}$`), {
        timeout: 15_000,
      });
      // paidId est utilisé pour le semis (KPI encaissé / top clients).
      expect(paidId).not.toBe("");
      expect(errors).toEqual([]);
    });
  });
}
