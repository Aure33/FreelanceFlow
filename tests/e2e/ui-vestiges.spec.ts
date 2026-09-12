import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Vestiges d'UI & fausses limitations (issue #101).
//
// Plusieurs commandes de l'interface promettaient des fonctionnalités « bientôt
// disponibles » alors qu'elles EXISTENT depuis #9 (PDF) et #84 (relances
// automatiques). Ces tests prouvent, dans un navigateur et sur des données
// réelles, que :
//   ① après l'émission d'un document, l'écran de confirmation ne dit plus
//     « prochainement » et propose un bouton « Télécharger le PDF » qui rend un
//     VRAI PDF (200 + signature %PDF sur la route de téléchargement) ;
//   ② la barre d'outils de l'éditeur ne porte AUCUN bouton « PDF » désactivé
//     (volontaire : dans l'éditeur le document est toujours un brouillon, et la
//     route PDF refuse les brouillons — 400, pas de numéro légal, #9) ;
//   ③ la liste /factures ne porte plus de bouton « Exporter » désactivé ;
//   ④ le panneau d'un document propose « Configurer les relances » (lien ACTIF
//     vers le réglage réel /parametres#relances) et non plus « Envoyer une
//     relance » désactivé — il n'existe pas d'envoi manuel, les relances sont
//     un balayage quotidien (#84).
// Plus aucune infobulle « Bientôt disponible » sur ces écrans.
//
// ⚠️ SÉLECTEURS : on vise des noms accessibles EXACTS. La topbar porte un
// bouton « Rechercher… », et une ligne de liste « brouillon » affiche
// « Brouillon » deux fois (cellule pièce + tag) — on ne compte jamais des
// getByText ici.
//
// NOTE STATUT HTTP (#56) : les pages du groupe app streament, on n'asserte donc
// jamais de statut HTTP sur une PAGE — uniquement le RENDU. La route API PDF,
// elle, n'est pas streamée : son statut est assertable.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement. ⚠️ Projet Supabase "dev" (jamais la prod, #17).
// Toutes les données créées sont nettoyées en afterAll.
//
// QUOTA FREEMIUM (#10) : le compte est neuf et n'émet qu'UN document via l'UI
// (la facture du test ④ est semée directement en base) — la limite de 5
// émissions par mois calendaire n'est jamais approchée.

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
  test.describe.skip("Vestiges d'UI & fausses limitations (#101)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Vestiges d'UI & fausses limitations (#101)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-vest-${RUN_ID}-Aa1!`;
    const SEEDED_NUMBER = `FAC-TEST-${RUN_ID}`;
    // Libellé unique saisi dans l'éditeur (émission réelle du test ①).
    const LINE_LABEL = `Atelier cadrage ${RUN_ID}`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;
    let seededInvoiceId: string;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-vest-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      user = { id: data.user.id, email: data.user.email! };

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const client = await prisma.client.create({
        data: { userId: user.id, name: `Client vestiges ${RUN_ID}` },
        select: { id: true },
      });
      clientId = client.id;

      const project = await prisma.project.create({
        data: {
          userId: user.id,
          clientId: client.id,
          name: `Projet vestiges ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectId = project.id;

      // Facture ÉMISE semée en base (aucune consommation de quota) : support du
      // test ④ (panneau d'actions d'un document émis).
      const invoice = await prisma.document.create({
        data: {
          userId: user.id,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: SEEDED_NUMBER,
          object: `Prestation ${RUN_ID}`,
          tvaRegime: "reel",
          issuedAt: new Date(),
          dueAt: new Date(),
          emittedAt: new Date(),
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          lines: {
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
          },
        },
        select: { id: true },
      });
      seededInvoiceId = invoice.id;
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté. Ordre imposé par les contraintes RESTRICT
      // du schéma : documents (cascade les lignes) -> projet -> client -> user.
      try {
        if (user?.id) {
          await prisma.document.deleteMany({ where: { userId: user.id } });
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
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user échouée :", e);
      }
    });

    test("éditeur : aucun bouton « PDF » désactivé ni infobulle « Bientôt disponible » avant émission", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/documents/nouveau");

      // L'éditeur est bien rendu (la barre d'aperçu porte « Émettre »).
      await expect(page.getByRole("button", { name: /Émettre/ })).toBeVisible();

      // Le bouton « PDF » de la barre d'aperçu a été RETIRÉ : dans l'éditeur le
      // document est toujours un brouillon, et la route PDF refuse les
      // brouillons (400, #9). Nom accessible EXACT pour ne pas confondre avec
      // « Télécharger le PDF » d'autres écrans.
      await expect(
        page.getByRole("button", { name: "PDF", exact: true }),
      ).toHaveCount(0);

      // Plus aucune fausse promesse : ni infobulle, ni texte.
      await expect(page.locator('[title*="Bientôt disponible"]')).toHaveCount(0);
      await expect(page.getByText(/Bientôt disponible/i)).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual(
        [],
      );
    });

    test("émission : l'écran de confirmation propose « Télécharger le PDF » (route -> 200 + %PDF), sans « prochainement »", async ({
      page,
    }) => {
      // Émission réelle puis génération Puppeteer réelle : plus lent qu'un
      // aller-retour JSON.
      test.setTimeout(120_000);
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/documents/nouveau");

      // Saisie minimale d'une facture émissible : projet + une ligne valide.
      await page.selectOption("#fProject", projectId!);
      await page
        .getByRole("textbox", { name: "Description de la ligne 1" })
        .fill(LINE_LABEL);
      await page
        .getByRole("textbox", { name: "Prix unitaire HT de la ligne 1" })
        .fill("400");

      const emitBtn = page.getByRole("button", { name: /Émettre/ });
      await expect(emitBtn).toBeEnabled();

      // CI (runner lent) : un clic peut partir avant la fin de l'hydratation
      // React — le handler n'est pas encore attaché, le clic est muet (flaky
      // systémique connu depuis le JS client Sentry, #88). On re-clique tant
      // que l'écran de confirmation n'est pas là ; aucun risque de double
      // émission (le bouton est `disabled` pendant l'action en vol, et
      // emitDocument refuse de ré-émettre un document déjà émis).
      const confirmation = page.getByRole("heading", { name: /Facture FAC-.* émise/ });
      await expect(async () => {
        if (!(await confirmation.isVisible())) {
          await emitBtn.click({ timeout: 2_000 });
        }
        await expect(confirmation).toBeVisible({ timeout: 8_000 });
      }).toPass({ timeout: 60_000 });

      // Texte corrigé : la promesse « prochainement » a disparu, le PDF est
      // annoncé comme disponible MAINTENANT.
      await expect(page.getByText(/prochainement/i)).toHaveCount(0);
      await expect(
        page.getByText(
          /Vous pouvez le télécharger en PDF ou le retrouver à tout moment dans vos factures/,
        ),
      ).toBeVisible();

      // Bouton de téléchargement présent, actif, et pointant la route PDF du
      // document qui vient d'être émis.
      const pdfLink = page.getByRole("link", { name: "Télécharger le PDF" });
      await expect(pdfLink).toBeVisible();
      const href = await pdfLink.getAttribute("href");
      expect(href).toMatch(/^\/api\/documents\/[0-9a-f-]{36}\/pdf$/);

      // Le lien ne promet pas un PDF : il en rend un. (Route API non streamée
      // -> statut HTTP assertable ; le cookie de session du navigateur est
      // partagé par `page.request`.)
      const res = await page.request.get(href!);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");
      const buffer = await res.body();
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual(
        [],
      );
    });

    test("liste /factures : plus de bouton « Exporter » désactivé", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/factures");

      // La liste est bien rendue (la facture semée est visible) — sans quoi
      // l'absence du bouton « Exporter » ne prouverait rien.
      await expect(page.getByText(SEEDED_NUMBER).first()).toBeVisible();

      await expect(page.getByRole("button", { name: /Exporter/i })).toHaveCount(
        0,
      );
      await expect(page.getByRole("link", { name: /Exporter/i })).toHaveCount(0);
      await expect(page.locator('[title*="Bientôt disponible"]')).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual(
        [],
      );
    });

    test("vue facture : « Configurer les relances » (lien actif) remplace « Envoyer une relance » désactivé", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/factures/${seededInvoiceId}`);

      await expect(page.getByText(SEEDED_NUMBER).first()).toBeVisible();

      // L'action décorative a disparu (aucun envoi manuel n'existe, #84).
      await expect(
        page.getByRole("button", { name: /Envoyer une relance/i }),
      ).toHaveCount(0);

      // Remplacée par un LIEN (donc actif par nature, jamais `disabled`) vers
      // le réglage réel.
      const link = page.getByRole("link", { name: "Configurer les relances" });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", "/parametres#relances");

      // Et ce lien mène à la carte de réglage qui existe vraiment.
      await link.click();
      await page.waitForURL(/\/parametres/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Relances automatiques" }),
      ).toBeVisible({ timeout: 15_000 });
      // L'ancre ciblée existe bien dans le DOM (scroll réel, pas un lien mort).
      await expect(page.locator("#relances")).toBeVisible();

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual(
        [],
      );
    });
  });
}
