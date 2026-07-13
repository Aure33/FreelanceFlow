import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Premier lancement (issue #60) — parcours réel de l'onboarding.
//
// Un VRAI utilisateur fraîchement créé (API admin Supabase, aucune donnée) :
//   - /dashboard affiche le guide « Premiers pas » (Bienvenue, 0/3, étape 1
//     courante) À LA PLACE du tableau de bord classique (« À traiter en
//     priorité » absent) ;
//   - « Ignorer ce guide » -> le tableau de bord classique s'affiche
//     (« Bonjour ») ; après reload, l'onboarding NE REVIENT PAS (cookie
//     ff-onboarding-dismissed, posé côté serveur par dismissOnboarding()) ;
//   - zéro erreur console sur tout le parcours.
//
// NOTE STATUT HTTP (#56) : les pages streament (app/(app)/loading.tsx), on
// n'asserte donc JAMAIS de statut HTTP ici — uniquement le RENDU.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement. ⚠️ Projet Supabase "dev" (jamais la prod, #17).
// L'utilisateur ne crée AUCUNE donnée métier (il ne fait qu'ignorer le guide) :
// le nettoyage se limite à la suppression du user Auth.

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
  test.describe.skip("Premier lancement / onboarding (#60)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Premier lancement / onboarding (#60)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-onb-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    // Compte NEUF : ni SIRET, ni client, ni document — l'état exact qui
    // déclenche l'écran « Premier lancement ».
    let user: { id: string; email: string };

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-onb-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      user = { id: data.user.id, email: data.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    test.afterAll(async () => {
      try {
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user onboarding échouée :", e);
      }
    });

    test("compte neuf -> /dashboard affiche « Premiers pas », pas le dashboard classique", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);

      // L'écran d'onboarding est rendu…
      await expect(page.getByText(/Bienvenue/).first()).toBeVisible();
      await expect(page.getByText("Premiers pas", { exact: true })).toBeVisible();
      await expect(page.getByText(/0 \/ 3 terminés/)).toBeVisible();
      // …avec l'étape 1 (SIRET) comme étape courante (aria-current="step").
      await expect(page.locator('[aria-current="step"]')).toContainText(/SIRET/i);
      // Le bouton de sortie du guide est présent (exigence « ignorable »).
      await expect(
        page.getByRole("button", { name: /ignorer ce guide/i }),
      ).toBeVisible();

      // …À LA PLACE du tableau de bord classique : ses blocs sont ABSENTS.
      await expect(page.getByText(/À traiter en priorité/)).toHaveCount(0);
      await expect(page.getByText(/^Bonjour/)).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("« Ignorer ce guide » -> dashboard classique, et le cookie tient au reload", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      // Contexte navigateur NEUF (Playwright isole chaque test) : pas de
      // cookie hérité, l'onboarding se montre d'abord — puis on l'ignore.
      await loginAs(page, user.email, PASSWORD);
      await expect(page.getByText("Premiers pas", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: /ignorer ce guide/i }).click();

      // Le tableau de bord classique prend le relais (états vides propres #47).
      await expect(page.getByText(/Bonjour/).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/À traiter en priorité/)).toBeVisible();
      await expect(page.getByText("Premiers pas", { exact: true })).toHaveCount(0);

      // Reload : le cookie ff-onboarding-dismissed persiste, l'onboarding ne
      // revient PAS.
      await page.reload();
      await expect(page.getByText(/Bonjour/).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Premiers pas", { exact: true })).toHaveCount(0);
      await expect(page.getByText(/Bienvenue/)).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
