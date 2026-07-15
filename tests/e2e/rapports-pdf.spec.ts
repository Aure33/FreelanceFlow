import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — cf. le commentaire
// détaillé dans documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Export PDF des rapports — GET /api/rapports/pdf (issue #64).
//
// Même architecture que le PDF document (#9, documents-pdf.spec.ts) : route API
// brute hors server actions, donc on couvre les garde-fous et le contrat HTTP :
//   401 JSON non authentifié / 200 + PDF valide pour une session réelle /
//   bouton « Exporter en PDF » actif sur /rapports sans erreur console.
//
// Ces tests créent 1 VRAI utilisateur Supabase Auth (API admin, clé
// SUPABASE_SECRET_KEY), se logent via le VRAI formulaire /connexion (cookies de
// session posés par le navigateur, comme en prod), puis appellent la route avec
// `page.request` (qui partage le cookie jar du contexte navigateur). Aucune
// donnée métier n'est nécessaire : la page /rapports rend des états vides pour
// un compte neuf, et le PDF se génère quand même.
//
// NON-FUITE PREMIUM : volontairement PAS assertée ici en grattant les octets du
// PDF — les flux internes d'un PDF sont compressés (FlateDecode), une recherche
// de texte brut dans le binaire serait non fiable (faux verts silencieux). La
// garantie vient du SERVEUR (#11) : Puppeteer navigue vers /rapports avec le
// cookie de session de l'utilisateur, c'est LA MÊME page rendue pour LA MÊME
// session, et `getReportsData()` renvoie `null` pour les blocs Premium d'un
// compte free (le serveur ne les calcule ni ne les envoie — déjà testé en #11).
// Le PDF ne peut donc pas contenir plus que l'écran.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY. Bun les
// charge automatiquement depuis .env.local (jamais committé) — si absents, la
// suite est SKIPPÉE proprement, jamais un faux vert silencieux.
//
// ⚠️ Utilise le projet Supabase pointé par .env.local (le projet "dev", jamais
// la prod réelle). L'utilisateur créé est supprimé en fin de suite (afterAll
// s'exécute toujours, même si un test échoue en cours de route).

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

if (!hasEnv) {
  test.describe.skip("Export PDF rapports — GET /api/rapports/pdf (#64)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Export PDF rapports — GET /api/rapports/pdf (#64)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-rapports-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    let user: { id: string; email: string };

    test.beforeAll(async () => {
      // 1 compte réel, e-mail confirmé (API admin : pas de flow de confirmation
      // à gérer, contrairement à une inscription normale). Aucune donnée métier
      // à semer : /rapports rend des états vides pour un compte neuf.
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-rapports-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      user = { id: data.user.id, email: data.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // (le profil est lu par le shell applicatif au premier rendu).
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté. La suppression du user Auth cascade sur
      // public.users (aucune donnée métier n'a été créée par cette suite).
      try {
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user échouée :", e);
      }
    });

    test("401 JSON si non authentifié (aucun cookie de session)", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const res = await context.request.get("/api/rapports/pdf");
      expect(res.status()).toBe(401);
      // Un vrai JSON d'erreur, jamais un PDF ni une page de redirection.
      expect(res.headers()["content-type"]).toContain("application/json");
      const body = await res.json();
      expect(body.error).toMatch(/Non authentifié/);
      await context.close();
    });

    test("200 + PDF valide pour une session authentifiée", async ({ page }) => {
      test.setTimeout(120_000); // génération Puppeteer réelle (navigation /rapports incluse)
      await loginAs(page, user.email, PASSWORD);
      const res = await page.request.get("/api/rapports/pdf", {
        timeout: 90_000,
      });
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");

      // Téléchargement nommé : rapport-activite-<année>.pdf
      const disposition = res.headers()["content-disposition"] ?? "";
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("rapport-activite-");
      expect(disposition).toContain(".pdf");

      const buffer = await res.body();
      // Signature de fichier PDF : les 4 premiers octets doivent être "%PDF".
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    });

    test("le bouton « Exporter en PDF » est actif sur /rapports, zéro erreur console", async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/rapports");

      // Avant #64 ce bouton était désactivé : il doit maintenant être un vrai
      // lien pointant vers la route API (getByRole "link" échoue sur un
      // <button disabled>, le test attrape donc toute régression).
      const exportLink = page.getByRole("link", { name: /exporter en pdf/i });
      await expect(exportLink).toBeVisible();
      await expect(exportLink).toHaveAttribute("href", "/api/rapports/pdf");

      expect(consoleErrors).toEqual([]);
    });
  });
}
