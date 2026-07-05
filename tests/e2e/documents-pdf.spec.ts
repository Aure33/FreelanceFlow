import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier. Sans lui, Playwright
// charge les specs en mode CJS et bricole `require.extensions['.ts']` — sous
// Bun ce chemin exécute le TypeScript BRUT sans le strip des annotations de
// type (AggregateError "N errors building ...spec.ts" dès la moindre
// annotation `: Type`). En mode ESM (import() dynamique), Bun transpile le
// TS nativement et tout fonctionne. Vérifié empiriquement le 2026-07-05.
//
// -----------------------------------------------------------------------------
// Sécurité de la route API GET /api/documents/[id]/pdf (issue #9, PDF Puppeteer).
//
// Cette route est la SEULE à ne pas passer par les server actions habituelles
// (app/(app)/documents/actions.ts) : c'est une route API brute, donc le point
// le plus important à couvrir n'est pas le rendu du PDF (déjà vérifié
// manuellement en réel) mais les 4 garde-fous de sécurité :
//   401 non authentifié / 404 isolation userId / 404 id inexistant /
//   400 brouillon / 200 + PDF valide pour le propriétaire.
//
// Ces tests créent 2 VRAIS utilisateurs Supabase Auth (API admin, clé
// SUPABASE_SECRET_KEY) et des données Prisma réelles (client → projet →
// documents), se logent via le VRAI formulaire /connexion (cookies de session
// posés par le navigateur, comme en prod), puis appellent la route avec
// `request` (qui partage le cookie jar du contexte navigateur — pas besoin de
// manipuler les cookies à la main).
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL. Bun les charge automatiquement depuis .env.local (jamais
// committé, cf. .gitignore) — si absents, la suite est SKIPPÉE proprement,
// jamais un faux vert silencieux.
//
// ⚠️ Utilise le projet Supabase pointé par .env.local (le projet "dev", faute
// de projet de TEST dédié tant que #17 n'a pas séparé dev/prod — jamais la
// prod réelle). Toutes les données créées (2 users + client/projet/documents)
// sont nettoyées en fin de suite, y compris si un test échoue en cours de
// route (afterAll s'exécute toujours).

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
  test.describe.skip(
    "Sécurité PDF — GET /api/documents/[id]/pdf (#9)",
    () => {
      test("secrets Supabase absents — cf. .env.local / #17", () => {});
    },
  );
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Sécurité PDF — GET /api/documents/[id]/pdf (#9)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-pdf-${RUN_ID}-Aa1!`;
    const EMITTED_NUMBER = `FAC-TEST-${RUN_ID}`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;
    let draftDocId: string;
    let emittedDocId: string;

    test.beforeAll(async () => {
      // 2 comptes réels, e-mail confirmé (API admin : pas de flow de
      // confirmation à gérer ici, contrairement à une inscription normale).
      const { data: a, error: errA } = await admin.auth.admin.createUser({
        email: `test-pdf-a-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (errA || !a?.user) {
        throw new Error(`Création de l'utilisateur A a échoué : ${errA?.message}`);
      }
      userA = { id: a.user.id, email: a.user.email! };

      const { data: b, error: errB } = await admin.auth.admin.createUser({
        email: `test-pdf-b-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (errB || !b?.user) {
        throw new Error(`Création de l'utilisateur B a échoué : ${errB?.message}`);
      }
      userB = { id: b.user.id, email: b.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant d'y référencer un client/projet/document.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const client = await prisma.client.create({
        data: { userId: userA.id, name: `Client test PDF ${RUN_ID}` },
        select: { id: true },
      });
      clientId = client.id;

      const project = await prisma.project.create({
        data: {
          userId: userA.id,
          clientId: client.id,
          name: `Projet test PDF ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectId = project.id;

      // Brouillon : pas de numéro, statut brouillon -> doit être refusé (400).
      const draft = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "brouillon",
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          lines: {
            create: [
              {
                userId: userA.id,
                label: "Prestation",
                quantity: 1,
                unitPriceCents: 10_000,
                tvaRate: 20,
                position: 0,
              },
            ],
          },
        },
        select: { id: true },
      });
      draftDocId = draft.id;

      // Émis : numéroté, statut envoyé -> doit produire un PDF pour A, et un
      // 404 pour n'importe quel autre utilisateur (isolation).
      const emitted = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: EMITTED_NUMBER,
          tvaRegime: "reel",
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          issuedAt: new Date(),
          lines: {
            create: [
              {
                userId: userA.id,
                label: "Prestation",
                quantity: 1,
                unitPriceCents: 10_000,
                tvaRate: 20,
                position: 0,
              },
            ],
          },
        },
        select: { id: true },
      });
      emittedDocId = emitted.id;
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté, même si un test a échoué en cours de
      // route. Ordre imposé par les contraintes RESTRICT du schéma :
      // documents (cascade les lignes) -> projet -> client -> users Auth.
      try {
        if (userA?.id) {
          await prisma.document.deleteMany({ where: { userId: userA.id } });
        }
      } catch (e) {
        console.warn("Nettoyage documents échoué :", e);
      }
      try {
        if (projectId) await prisma.project.delete({ where: { id: projectId } });
      } catch (e) {
        console.warn("Nettoyage projet échoué :", e);
      }
      try {
        if (clientId) await prisma.client.delete({ where: { id: clientId } });
      } catch (e) {
        console.warn("Nettoyage client échoué :", e);
      }
      await prisma.$disconnect();

      try {
        if (userA?.id) await admin.auth.admin.deleteUser(userA.id);
      } catch (e) {
        console.warn("Suppression user A échouée :", e);
      }
      try {
        if (userB?.id) await admin.auth.admin.deleteUser(userB.id);
      } catch (e) {
        console.warn("Suppression user B échouée :", e);
      }
    });

    test("401 si non authentifié (aucun cookie de session)", async ({
      browser,
    }) => {
      const context = await browser.newContext();
      const res = await context.request.get(`/api/documents/${emittedDocId}/pdf`);
      expect(res.status()).toBe(401);
      await context.close();
    });

    test("404 si le document appartient à un autre utilisateur (isolation)", async ({
      page,
    }) => {
      await loginAs(page, userB.email, PASSWORD);
      // emittedDocId appartient à A : B ne doit jamais pouvoir le récupérer.
      const res = await page.request.get(`/api/documents/${emittedDocId}/pdf`);
      expect(res.status()).toBe(404);
    });

    test("404 si le document n'existe pas", async ({ page }) => {
      await loginAs(page, userA.email, PASSWORD);
      const res = await page.request.get(`/api/documents/${randomUUID()}/pdf`);
      expect(res.status()).toBe(404);
    });

    test("400 si le document est encore en brouillon (pas de numéro)", async ({
      page,
    }) => {
      await loginAs(page, userA.email, PASSWORD);
      const res = await page.request.get(`/api/documents/${draftDocId}/pdf`);
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Émettez le document/);
    });

    test("200 + PDF valide pour un document émis appartenant à l'utilisateur", async ({
      page,
    }) => {
      test.setTimeout(60_000); // génération Puppeteer réelle, plus lente qu'un aller-retour JSON
      await loginAs(page, userA.email, PASSWORD);
      const res = await page.request.get(`/api/documents/${emittedDocId}/pdf`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");

      const buffer = await res.body();
      // Signature de fichier PDF : les 4 premiers octets doivent être "%PDF".
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    });
  });
}
