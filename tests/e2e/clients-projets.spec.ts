import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// CRUD Clients + Projets et ISOLATION entre utilisateurs (issue #32).
//
// Deux VRAIS utilisateurs (A et B) sont créés via l'API admin Supabase. On
// exerce :
//   - Clients : état vide, création via le formulaire, vérification SIRET
//     (test défensif, dépend de l'API SIRENE externe côté serveur),
//   - Projets : cas « aucun client » (bouton désactivé), création via la
//     modale, bascule des vues grille / kanban,
//   - Isolation : B ne peut PAS ouvrir les fiches client/projet de A (404),
//   - Zéro erreur console sur un parcours représentatif.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement.
//
// ⚠️ Projet Supabase "dev" (jamais la prod, cf. #17). Nettoyage EXHAUSTIF en
// afterAll dans l'ordre RESTRICT du schéma : documents -> projets -> clients
// -> users Auth. Aucune donnée orpheline laissée sur le projet.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// SIRET d'établissement notoire et stable : siège social de GOOGLE FRANCE SARL
// (SIREN 443 061 841, NIC du siège 00048). Établissement actif, présent au
// répertoire SIRENE — l'API gratuite « Recherche d'entreprises » le reconnaît.
// Utilisé UNIQUEMENT dans le test défensif de vérification SIRET.
const KNOWN_SIRET = "44306184100048";

// Helper de connexion via le VRAI formulaire /connexion (recréé dans chaque
// fichier : les specs Playwright sont indépendantes).
async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

if (!hasEnv) {
  test.describe.skip("Clients / Projets / Isolation (#32)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Clients / Projets / Isolation (#32)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-cp-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let userA: { id: string; email: string };
    let userB: { id: string; email: string };

    // Données de A référencées dans plusieurs tests (isolation notamment).
    // Ce client + projet sont créés en Prisma (setup) pour piloter les vues
    // projet et servir de cibles d'isolation. Le nom porte RUN_ID pour être
    // recherchable de façon univoque dans le HTML.
    const clientAName = `Client A ${RUN_ID}`;
    const projectAName = `Projet A ${RUN_ID}`;
    let clientAId: string;
    let projectAId: string;

    test.beforeAll(async () => {
      const { data: a, error: errA } = await admin.auth.admin.createUser({
        email: `test-cp-a-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (errA || !a?.user) {
        throw new Error(`Création de l'utilisateur A a échoué : ${errA?.message}`);
      }
      userA = { id: a.user.id, email: a.user.email! };

      const { data: b, error: errB } = await admin.auth.admin.createUser({
        email: `test-cp-b-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (errB || !b?.user) {
        throw new Error(`Création de l'utilisateur B a échoué : ${errB?.message}`);
      }
      userB = { id: b.user.id, email: b.user.email! };

      // Laisse le trigger `on_auth_user_created` créer les lignes public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Client + projet de A (cibles d'isolation et support des vues projet).
      const client = await prisma.client.create({
        data: { userId: userA.id, name: clientAName },
        select: { id: true },
      });
      clientAId = client.id;

      const project = await prisma.project.create({
        data: { userId: userA.id, clientId: client.id, name: projectAName },
        select: { id: true },
      });
      projectAId = project.id;
    });

    test.afterAll(async () => {
      // Nettoyage EXHAUSTIF — toujours exécuté. Ordre RESTRICT du schéma :
      // documents -> projets -> clients -> users Auth. On supprime par userId
      // pour balayer aussi les données créées via l'UI pendant les tests
      // (client créé au formulaire, projet créé à la modale).
      for (const uid of [userA?.id, userB?.id].filter(Boolean) as string[]) {
        try {
          await prisma.document.deleteMany({ where: { userId: uid } });
        } catch (e) {
          console.warn("Nettoyage documents échoué :", e);
        }
        try {
          await prisma.project.deleteMany({ where: { userId: uid } });
        } catch (e) {
          console.warn("Nettoyage projets échoué :", e);
        }
        try {
          await prisma.client.deleteMany({ where: { userId: uid } });
        } catch (e) {
          console.warn("Nettoyage clients échoué :", e);
        }
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

    // ---- Clients ------------------------------------------------------------

    test("Clients — état vide pour un compte neuf", async ({ page }) => {
      // B n'a aucun client : la page /clients doit afficher l'état vide.
      await loginAs(page, userB.email, PASSWORD);
      await page.goto("/clients");
      await expect(
        page.getByText(/Aucun client pour l'instant/i),
      ).toBeVisible();
    });

    test("Clients — création via le formulaire (sans SIRET)", async ({ page }) => {
      // On saisit directement le nom (combobox #nom) SANS SIRET pour ne pas
      // dépendre de l'API SIRENE externe dans ce test cœur. B crée son client.
      const clientName = `Client B ${RUN_ID}`;
      await loginAs(page, userB.email, PASSWORD);
      await page.goto("/clients/nouveau");

      await page.locator("#nom").fill(clientName);
      await page.getByRole("button", { name: /enregistrer le client/i }).click();

      // Succès -> redirection vers la fiche /clients/[id], nom visible (le nom
      // apparaît dans l'en-tête ET le fil d'Ariane : .first() évite le strict mode).
      await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 15_000 });
      await expect(page.getByText(clientName).first()).toBeVisible();

      // La liste /clients doit ensuite contenir ce client (table).
      await page.goto("/clients");
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByText(clientName)).toBeVisible();
    });

    test("Clients — vérification SIRET + préremplissage (défensif)", async ({
      page,
    }) => {
      // Ce test DÉPEND de l'API externe « Recherche d'entreprises » appelée
      // CÔTÉ SERVEUR (lookupSiret) — impossible à mocker via page.route (ce
      // n'est pas une requête du navigateur). Il est donc écrit DÉFENSIF pour
      // ne jamais produire de faux rouge en CI :
      //   - on saisit un SIRET réel de 14 chiffres,
      //   - on attend un état TERMINAL du badge (« Vérifié » OU « Non reconnu »,
      //     annoncé via aria-live),
      //   - SI « Vérifié » : on asserte que #nom s'est prérempli (non vide).
      // La dégradation gracieuse (API indisponible -> « Non reconnu ») est un
      // comportement ATTENDU et couvert ici, PAS un échec du test.
      await loginAs(page, userB.email, PASSWORD);
      await page.goto("/clients/nouveau");

      await page.locator("#siret").fill(KNOWN_SIRET);
      // Force la vérification sans attendre le debounce (bouton « Rechercher »).
      await page.getByRole("button", { name: /rechercher/i }).click();

      const verified = page.getByText("Vérifié", { exact: true });
      const unverified = page.getByText("Non reconnu", { exact: true });
      const checking = page.getByText("Vérification…", { exact: true });
      // Attente d'un état terminal, quelle que soit l'issue de l'appel externe.
      // 3e issue tolérée : l'API externe PEND (ni succès ni échec en 20 s) —
      // observé en réel. Le formulaire doit alors simplement rester sain
      // (état « Vérification… » affiché, aucune erreur), c'est aussi une
      // dégradation gracieuse — jamais un échec de CI pour un tiers indispo.
      try {
        await expect(verified.or(unverified)).toBeVisible({ timeout: 20_000 });
      } catch {
        await expect(checking).toBeVisible();
        console.warn(
          "SIRENE injoignable pendant le test (appel resté en attente) — dégradation gracieuse vérifiée, préremplissage non testé.",
        );
        return;
      }

      if (await verified.isVisible()) {
        // API up + SIRET reconnu : le nom doit avoir été prérempli.
        await expect(page.locator("#nom")).not.toHaveValue("");
      } else {
        // API down ou SIRET non reconnu : dégradation gracieuse attendue.
        // (Pas d'assertion d'échec : le badge « Non reconnu » suffit.)
        expect(await unverified.isVisible()).toBe(true);
      }
    });

    // ---- Projets ------------------------------------------------------------

    test("Projets — modale « aucun client » : création désactivée", async ({
      page,
    }) => {
      // A possède déjà un client (setup), il ne convient donc pas à ce cas.
      // On crée un utilisateur éphémère SANS client pour ce test précis, et on
      // le supprime immédiatement après (finally).
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-cp-noclient-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création utilisateur sans client a échoué : ${error?.message}`);
      }
      const noClientUser = { id: data.user.id, email: data.user.email! };
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        await loginAs(page, noClientUser.email, PASSWORD);
        await page.goto("/projets");
        await page.getByRole("button", { name: /nouveau projet/i }).first().click();

        // Modale : invite à créer un client, bouton « Créer le projet » désactivé.
        await expect(page.getByText(/Créez d'abord un client/i)).toBeVisible();
        await expect(
          page.getByRole("button", { name: /créer le projet/i }),
        ).toBeDisabled();
      } finally {
        // Nettoyage immédiat de l'utilisateur éphémère (aucune donnée métier).
        await admin.auth.admin.deleteUser(noClientUser.id).catch(() => {});
      }
    });

    test("Projets — création via la modale", async ({ page }) => {
      // A possède déjà un client (setup) : on crée un nouveau projet via la modale.
      const projectName = `Projet modale ${RUN_ID}`;
      await loginAs(page, userA.email, PASSWORD);
      await page.goto("/projets");

      await page.getByRole("button", { name: /nouveau projet/i }).first().click();
      await page.locator("#pTitre").fill(projectName);
      // Sélection du client par son libellé visible dans le <select>.
      await page.locator("#pClient").selectOption({ label: clientAName });
      await page.getByRole("button", { name: /créer le projet/i }).click();

      // Succès -> redirection vers la fiche /projets/[id], titre visible.
      await page.waitForURL(/\/projets\/[0-9a-f-]{36}/, { timeout: 15_000 });
      await expect(page.getByText(projectName).first()).toBeVisible();
    });

    test("Projets — bascule des vues grille / kanban", async ({ page }) => {
      // A possède au moins un projet (setup + test précédent).
      await loginAs(page, userA.email, PASSWORD);
      await page.goto("/projets");

      const viewGroup = page.getByRole("radiogroup", { name: /Type d'affichage/i });
      await expect(viewGroup).toBeVisible();

      // Vue kanban : colonnes de statut (STATUS_META). « En cours » apparaît
      // dans les 2 vues (chip de filtre en grille + en-tête de colonne), on
      // vérifie donc « Terminé » et « En pause » qui sont propres au kanban.
      await viewGroup.getByRole("radio", { name: "kanban" }).click();
      await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
      await expect(page.getByText("En pause", { exact: true })).toBeVisible();

      // Retour à la grille : la carte du projet de A doit être présente.
      await viewGroup.getByRole("radio", { name: "grille" }).click();
      await expect(page.getByText(projectAName).first()).toBeVisible();
    });

    // ---- Isolation A / B ----------------------------------------------------

    // ANTI-RÉGRESSION : getClient/getProject filtrent `where { id, userId }`
    // puis appellent notFound() si null. Si ce filtre `userId` sautait (bug),
    // B chargerait la fiche de A -> page rendue + nom de A visible, et CES
    // assertions basculeraient au rouge. Le test attrape donc bien la fuite.
    //
    // NOTE STATUT HTTP (#56) : depuis l'ajout de `app/(app)/loading.tsx`,
    // Next STREAME les pages dynamiques — le statut (200) part avec le shell
    // avant que `notFound()` ne soit atteint, il ne peut plus être 404 pour
    // les pages (comportement documenté du streaming App Router). Le contrat
    // de sécurité testé ici est donc le RENDU : UI not-found affichée + zéro
    // donnée de A dans la page. L'API PDF, non streamée, garde ses vrais 404
    // (cf. documents-pdf.spec.ts).

    test("Isolation — B ne peut pas ouvrir la fiche client de A (not-found)", async ({
      page,
    }) => {
      await loginAs(page, userB.email, PASSWORD);
      await page.goto(`/clients/${clientAId}`);
      // L'UI not-found de Next doit s'afficher…
      await expect(
        page.getByText(/could not be found|introuvable/i),
      ).toBeVisible();
      // …et le nom du client de A ne doit JAMAIS apparaître pour B.
      await expect(page.getByText(clientAName)).toHaveCount(0);
    });

    test("Isolation — B ne peut pas ouvrir la fiche projet de A (not-found)", async ({
      page,
    }) => {
      await loginAs(page, userB.email, PASSWORD);
      await page.goto(`/projets/${projectAId}`);
      await expect(
        page.getByText(/could not be found|introuvable/i),
      ).toBeVisible();
      await expect(page.getByText(projectAName)).toHaveCount(0);
    });

    // ---- Qualité : zéro erreur console --------------------------------------

    test("Zéro erreur console sur un parcours représentatif", async ({ page }) => {
      const errors: string[] = [];

      // Bruits connus, non bloquants, à ignorer (jamais une vraie erreur
      // applicative : on ne filtre que sur des motifs d'infrastructure).
      const IGNORED = [
        /favicon/i,
        /Failed to load resource.*404.*favicon/i,
      ];
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

      // Parcours : login A -> dashboard -> clients -> projets.
      await loginAs(page, userA.email, PASSWORD);
      await page.goto("/clients");
      await expect(page.getByText("Clients", { exact: true }).first()).toBeVisible();
      await page.goto("/projets");
      await expect(page.getByText("Projets", { exact: true }).first()).toBeVisible();

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
