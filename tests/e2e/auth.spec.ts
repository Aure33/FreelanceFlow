import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`. En mode ESM, Bun transpile le TS
// nativement et Playwright charge la spec sans erreur.
//
// -----------------------------------------------------------------------------
// Parcours d'AUTHENTIFICATION et protection des routes (issue #32).
//
// Ces tests exercent le VRAI flux navigateur :
//   - inscription réelle via /inscription -> /dashboard (confirmation e-mail
//     OFF en dev, cf. CLAUDE.md #3),
//   - connexion réussie avec un compte pré-créé (API admin),
//   - connexion échouée (message générique anti-énumération),
//   - déconnexion via le menu utilisateur de la sidebar,
//   - protection des routes du groupe (app) par le middleware (redirection
//     vers /connexion pour un contexte sans session).
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL. Chargés par Bun depuis .env.local (jamais committé) — si
// absents, la suite est SKIPPÉE proprement, jamais un faux vert.
//
// ⚠️ Utilise le projet Supabase pointé par .env.local (projet "dev", pas la
// prod, tant que #17 n'a pas séparé dev/prod). TOUTES les données créées (le
// compte pré-créé ET le compte issu de l'inscription réelle) sont nettoyées
// en afterAll, y compris si un test échoue en cours de route.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// Helper de connexion via le VRAI formulaire /connexion (recréé dans chaque
// fichier : les specs Playwright sont indépendantes). Labels EXACTS de
// `components/auth/sign-in-form.tsx`.
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

if (!hasEnv) {
  test.describe.skip("Auth & protection des routes (#32)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Auth & protection des routes (#32)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    // Mots de passe conformes au schéma zod (>= 8 caractères, au moins un chiffre).
    const PASSWORD = `Test-auth-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    // Compte pré-créé (API admin) pour les tests connexion / déconnexion.
    let existingUser: { id: string; email: string };
    // Compte issu de l'inscription RÉELLE (via /inscription) : on retrouve son
    // id après coup pour pouvoir le supprimer en afterAll.
    const signupEmail = `test-auth-signup-${RUN_ID}@freelanceflow.test`;
    let signupUserId: string | undefined;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-auth-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création du compte pré-créé a échoué : ${error?.message}`);
      }
      existingUser = { id: data.user.id, email: data.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté. Aucune donnée métier n'est créée ici
      // (que des comptes), on supprime donc directement les users Auth. La
      // ligne public.users est retirée par la cascade du trigger de suppression.
      await prisma.$disconnect();

      try {
        if (existingUser?.id) await admin.auth.admin.deleteUser(existingUser.id);
      } catch (e) {
        console.warn("Suppression du compte pré-créé échouée :", e);
      }
      try {
        if (signupUserId) await admin.auth.admin.deleteUser(signupUserId);
      } catch (e) {
        console.warn("Suppression du compte d'inscription échouée :", e);
      }
    });

    test("inscription réelle -> redirige vers /dashboard", async ({ page }) => {
      await page.goto("/inscription");

      // Labels EXACTS de `components/auth/sign-up-form.tsx`. « Adresse e-mail
      // professionnelle » (et non « Adresse e-mail ») pour ne pas confondre
      // avec le champ de la page connexion.
      await page.getByLabel("Prénom").fill("Test");
      await page.getByLabel("Nom", { exact: true }).fill(`Auth ${RUN_ID}`);
      await page.getByLabel("Adresse e-mail professionnelle").fill(signupEmail);
      await page.getByLabel("Mot de passe").fill(PASSWORD);
      await page.getByRole("button", { name: /créer mon compte/i }).click();

      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
      expect(page.url()).toContain("/dashboard");

      // On retrouve l'id du compte fraîchement créé pour le nettoyage afterAll.
      const created = await prisma.user.findFirst({
        where: { email: signupEmail },
        select: { id: true },
      });
      signupUserId = created?.id;
      expect(signupUserId, "le profil public.users doit exister après inscription").toBeTruthy();
    });

    test("connexion valide -> /dashboard", async ({ page }) => {
      await loginAs(page, existingUser.email, PASSWORD);
      expect(page.url()).toContain("/dashboard");
    });

    test("mauvais mot de passe -> reste sur /connexion + message générique", async ({
      page,
    }) => {
      await page.goto("/connexion");
      await page.getByLabel("Adresse e-mail").fill(existingUser.email);
      await page.getByLabel("Mot de passe").fill("MauvaisMdp-000!");
      await page.getByRole("button", { name: /se connecter/i }).click();

      // Message générique anti-énumération (GENERIC_AUTH_ERROR de
      // lib/auth/actions.ts) : ne révèle jamais la cause exacte.
      await expect(page.getByText(/Identifiants incorrects/i)).toBeVisible();

      // L'URL ne doit PAS avoir changé : aucune session posée.
      expect(page.url()).toContain("/connexion");
      expect(page.url()).not.toContain("/dashboard");
    });

    test("déconnexion via le menu utilisateur -> /connexion", async ({ page }) => {
      await loginAs(page, existingUser.email, PASSWORD);

      // Bouton user-chip de la sidebar (aria-haspopup="menu", cf.
      // components/layout/user-menu.tsx : pas de nom accessible textuel stable,
      // on cible l'attribut), puis item « Déconnexion » (role menuitem, form
      // action signOut).
      await page.locator('button[aria-haspopup="menu"]').click();
      await page.getByRole("menuitem", { name: /déconnexion/i }).click();

      await page.waitForURL(/\/connexion/, { timeout: 15_000 });
      expect(page.url()).toContain("/connexion");
    });

    test("route protégée /dashboard sans session -> /connexion", async ({
      browser,
    }) => {
      // Contexte NEUF (aucun cookie de session) : le middleware doit rediriger.
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/dashboard");
      await page.waitForURL(/\/connexion/, { timeout: 15_000 });
      expect(page.url()).toContain("/connexion");
      await context.close();
    });

    test("route protégée /clients sans session -> /connexion", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/clients");
      await page.waitForURL(/\/connexion/, { timeout: 15_000 });
      expect(page.url()).toContain("/connexion");
      await context.close();
    });
  });
}
