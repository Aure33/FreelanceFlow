import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Compte : mot de passe / suppression RGPD (issue #68) — parcours réels.
//
// Ces deux flux EXERCENT le vrai client Supabase SSR (cookies de session), ce
// que l'intégration ne peut pas faire hors requête HTTP :
//   1. Changement de mot de passe : après « Mot de passe mis à jour. », on se
//      déconnecte et on prouve la bascule EN CONDITIONS RÉELLES — le NOUVEAU
//      mot de passe connecte, l'ANCIEN échoue.
//   2. Suppression de compte (droit à l'effacement) : confirmation forte
//      (bouton désactivé tant que l'adresse saisie ≠ adresse du compte),
//      redirection vers la landing, reconnexion impossible, et vérité BASE
//      (0 ligne users/clients pour cet id via Prisma).
//
// NOTE STATUT HTTP (#56) : les pages streament — on n'asserte jamais de statut
// HTTP, seulement le RENDU.
//
// Secrets : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL (lus
// depuis .env.local). Absents -> suite SKIPPÉE proprement. ⚠️ Projet DEV.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

async function loginExpectingSuccess(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  // Un signOut/suppression peut logguer un 401 réseau attendu (session coupée)
  // et le prefetch RSC peut échouer pendant une redirection — bruits d'infra.
  const IGNORED = [
    /favicon/i,
    /Failed to load resource/i,
    /Failed to fetch RSC payload/i,
    /401/,
  ];
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
  test.describe.skip("Compte RGPD (#68)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  test.describe("Compte : mot de passe (#68)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const OLD_PASSWORD = `Test-pwd-${RUN_ID}-Aa1!`;
    const NEW_PASSWORD = `Test-pwd-${RUN_ID}-Zz9!`;
    const EMAIL = `test-acc-pwd-${RUN_ID}@freelanceflow.test`;
    let userId: string | null = null;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: OLD_PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création utilisateur : ${error?.message}`);
      }
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));
    });

    test.afterAll(async () => {
      try {
        if (userId) await admin.auth.admin.deleteUser(userId);
      } catch (e) {
        console.warn("Nettoyage user mot de passe échoué :", e);
      }
    });

    test("changer de mot de passe : le nouveau connecte, l'ancien échoue", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginExpectingSuccess(page, EMAIL, OLD_PASSWORD);

      // Section Compte des Paramètres.
      await page.goto("/parametres");
      await page.getByLabel("Mot de passe actuel").fill(OLD_PASSWORD);
      await page.getByLabel("Nouveau mot de passe").fill(NEW_PASSWORD);
      await page
        .getByRole("button", { name: /mettre à jour le mot de passe/i })
        .click();
      await expect(page.getByText(/Mot de passe mis à jour\./i)).toBeVisible();

      // Déconnexion réelle (bouton de la section Compte).
      await page.getByRole("button", { name: /déconnexion/i }).click();
      await page.waitForURL(/\/connexion/, { timeout: 15_000 });

      // L'ANCIEN mot de passe échoue désormais (message générique).
      await page.getByLabel("Adresse e-mail").fill(EMAIL);
      await page.getByLabel("Mot de passe").fill(OLD_PASSWORD);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await expect(page.getByText(/Identifiants incorrects/i)).toBeVisible();

      // Le NOUVEAU mot de passe connecte pour de vrai.
      await loginExpectingSuccess(page, EMAIL, NEW_PASSWORD);

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });

  test.describe("Compte : suppression RGPD (#68)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-del-${RUN_ID}-Aa1!`;
    const EMAIL = `test-acc-del-${RUN_ID}@freelanceflow.test`;
    let userId: string | null = null;
    const prisma = new PrismaClient();

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création utilisateur : ${error?.message}`);
      }
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));
      // Une donnée métier pour prouver la cascade jusqu'aux tables.
      await prisma.client.create({
        data: { userId: userId!, name: "Client à effacer" },
      });
    });

    test.afterAll(async () => {
      // Le test SUPPRIME le compte lui-même : nettoyage tolérant au cas où il
      // n'aurait pas abouti.
      try {
        if (userId) {
          await prisma.client.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
          await admin.auth.admin.deleteUser(userId);
        }
      } catch {
        /* déjà supprimé par le test : normal */
      }
      await prisma.$disconnect();
    });

    test("supprimer le compte : confirmation forte, effacement total, reconnexion impossible", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginExpectingSuccess(page, EMAIL, PASSWORD);
      await page.goto("/parametres");

      // Ouvre la modale de suppression.
      await page.getByRole("button", { name: /^supprimer…$/i }).click();
      const confirmBtn = page.getByRole("button", {
        name: /supprimer définitivement/i,
      });
      // Confirmation forte : désactivé tant que l'adresse ne correspond pas.
      await expect(confirmBtn).toBeDisabled();
      await page
        .getByLabel(/saisissez l'adresse e-mail du compte/i)
        .fill("mauvaise@adresse.fr");
      await expect(confirmBtn).toBeDisabled();

      // Adresse exacte -> le bouton s'active.
      await page
        .getByLabel(/saisissez l'adresse e-mail du compte/i)
        .fill(EMAIL);
      await expect(confirmBtn).toBeEnabled();

      await confirmBtn.click();
      // Redirection vers la landing publique.
      await page.waitForURL(/\/$/, { timeout: 15_000 });

      // Reconnexion impossible (compte Auth supprimé).
      await page.goto("/connexion");
      await page.getByLabel("Adresse e-mail").fill(EMAIL);
      await page.getByLabel("Mot de passe").fill(PASSWORD);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await expect(page.getByText(/Identifiants incorrects/i)).toBeVisible();

      // Vérité BASE : plus aucune ligne pour cet id.
      expect(await prisma.user.count({ where: { id: userId! } })).toBe(0);
      expect(await prisma.client.count({ where: { userId: userId! } })).toBe(0);

      expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
