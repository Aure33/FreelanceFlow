import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Recherche globale ⌘K (issue #63) — parcours réel de la palette de la topbar.
//
// Un VRAI utilisateur éphémère (API admin Supabase) avec fixtures Prisma
// (1 client, 1 projet, 1 facture ÉMISE numérotée) :
//   - raccourci clavier Ctrl+K (Playwright Linux : `Control+k`) → la palette
//     s'ouvre (role=dialog + input combobox focus), taper le nom du client →
//     résultat groupé « Clients », Enter direct (le 1er item est déjà actif)
//     → navigation vers la fiche /clients/[id] ;
//   - clic sur le déclencheur de la topbar → palette ouverte, taper un numéro
//     de document → résultat « Facture · <client> », Échap ferme la palette ;
//   - zéro erreur console sur les deux parcours.
//
// NOTE STATUT HTTP (#56) : les pages streament (app/(app)/loading.tsx), on
// n'asserte donc JAMAIS de statut HTTP ici — uniquement le RENDU.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement. ⚠️ Projet Supabase "dev" (jamais la prod, #17).
// Nettoyage EXHAUSTIF en afterAll dans l'ordre RESTRICT du schéma :
// documents -> projets -> clients -> user Auth.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// Helper de connexion via le VRAI formulaire /connexion (recréé dans chaque
// fichier : les specs Playwright sont indépendantes).
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

// Collecte des erreurs console/pageerror (bruits d'infra ignorés, jamais une
// erreur applicative) — assertée à la fin de chaque test.
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const IGNORED = [/favicon/i, /Failed to load resource.*404.*favicon/i];
  const isIgnored = (msg: string) => IGNORED.some((re) => re.test(msg));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isIgnored(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    if (!isIgnored(err.message)) {
      errors.push(`pageerror: ${err.message}`);
    }
  });
  return errors;
}

if (!hasEnv) {
  test.describe.skip("Recherche globale ⌘K (#63)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Recherche globale ⌘K (#63)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-search-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };

    // Fixtures recherchables de façon univoque (RUN_ID dans le nom du client ;
    // le numéro n'a besoin d'être unique que PAR utilisateur — user éphémère).
    const clientName = `Client Recherche ${RUN_ID}`;
    const docNumber = "FAC-2097-042";
    let clientId: string;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-search-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      user = { id: data.user.id, email: data.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Client -> projet -> facture ÉMISE (numérotée : seuls les documents
      // émis remontent dans la recherche, les brouillons n'ont pas de numéro).
      const client = await prisma.client.create({
        data: { userId: user.id, name: clientName },
        select: { id: true },
      });
      clientId = client.id;
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          clientId: client.id,
          name: `Projet Recherche ${RUN_ID}`,
        },
        select: { id: true },
      });
      await prisma.document.create({
        data: {
          userId: user.id,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: docNumber,
          totalHtCents: 100_000,
          totalTvaCents: 20_000,
          totalTtcCents: 120_000,
          issuedAt: new Date(),
          emittedAt: new Date(),
        },
        select: { id: true },
      });
    });

    test.afterAll(async () => {
      // Nettoyage EXHAUSTIF — toujours exécuté. Ordre RESTRICT du schéma.
      try {
        if (user?.id) {
          await prisma.document.deleteMany({ where: { userId: user.id } });
          await prisma.project.deleteMany({ where: { userId: user.id } });
          await prisma.client.deleteMany({ where: { userId: user.id } });
        }
      } catch (e) {
        console.warn("Nettoyage données recherche échoué :", e);
      }
      await prisma.$disconnect();
      try {
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user recherche échouée :", e);
      }
    });

    test("Ctrl+K ouvre la palette, la recherche d'un client navigue vers sa fiche (Enter)", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);

      // Raccourci global (Linux/Windows : Ctrl+K ; le handler écoute aussi ⌘K).
      await page.keyboard.press("Control+k");

      // La palette est un dialog accessible, l'input combobox reçoit le focus.
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const combobox = dialog.getByRole("combobox");
      await expect(combobox).toBeFocused();

      // État initial : invite « au moins 2 caractères ».
      await expect(dialog.getByText(/au moins 2 caractères/i)).toBeVisible();

      // Taper le nom du client fixture → résultat groupé « Clients ».
      // (Portée DIALOG obligatoire : « Clients » existe aussi dans la sidebar.)
      await combobox.fill(clientName);
      await expect(
        dialog.getByRole("option", { name: new RegExp(clientName) }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByText("Clients", { exact: true })).toBeVisible();

      // Le 1er (et seul) résultat est DÉJÀ actif : Enter direct navigue.
      await expect(
        dialog.getByRole("option", { name: new RegExp(clientName) }),
      ).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("Enter");

      // Navigation vers la fiche client : URL + nom visible sur la page.
      await page.waitForURL(new RegExp(`/clients/${clientId}`), {
        timeout: 15_000,
      });
      await expect(page.getByText(clientName).first()).toBeVisible();
      // La palette s'est refermée en naviguant.
      await expect(page.getByRole("dialog")).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("clic sur le déclencheur : recherche d'un numéro de document, Échap ferme la palette", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);

      // Déclencheur de la topbar (faux champ « Rechercher un client, une
      // facture… » ; nom accessible = aria-label avec le raccourci).
      await page
        .getByRole("button", { name: /rechercher \(raccourci cmd\+k ou ctrl\+k\)/i })
        .click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Taper le numéro de la facture fixture → résultat « Facture · <client> ».
      await dialog.getByRole("combobox").fill(docNumber);
      const option = dialog.getByRole("option", { name: new RegExp(docNumber) });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await expect(option).toContainText(`Facture · ${clientName}`);
      await expect(dialog.getByText("Documents", { exact: true })).toBeVisible();

      // Échap ferme la palette (dialog absent du DOM).
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
