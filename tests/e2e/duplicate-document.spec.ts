import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Duplication de document (issue #66) — parcours utilisateur réel.
//
// Un VRAI utilisateur (API admin Supabase) avec client → projet → facture ÉMISE
// et PAYÉE (fabriqués via Prisma direct, comme convert-quote.spec.ts) :
//   - la vue de la facture montre « Dupliquer » ACTIF dans le panneau ; le clic
//     crée le brouillon et atterrit sur l'éditeur
//     `/documents/nouveau?document=<id>` avec les lignes de la facture
//     pré-remplies (libellé + total TTC recalculé au centime) ; la liste
//     /factures affiche ensuite UN brouillon de plus ;
//   - la liste /factures porte un bouton par ligne (aria-label
//     « Dupliquer FAC-… ») qui mène au même éditeur pré-rempli ;
//   - zéro erreur console sur tout le parcours.
//
// ⚠️ SÉLECTEURS : plusieurs boutons « Dupliquer » coexistent (panneau de la vue
// + un par ligne de la liste) — on vise TOUJOURS le nom accessible EXACT :
// « Dupliquer » (panneau) vs « Dupliquer FAC-TEST-… » (ligne).
//
// NOTE STATUT HTTP (#56) : les pages streament (app/(app)/loading.tsx), on
// n'asserte donc JAMAIS de statut HTTP ici — uniquement le RENDU.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement. ⚠️ Projet Supabase "dev" (jamais la prod, #17).
// Toutes les données créées sont nettoyées en afterAll.

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
  test.describe.skip("Duplication de document (#66)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Duplication de document (#66)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-dup-${RUN_ID}-Aa1!`;
    const INVOICE_NUMBER = `FAC-TEST-${RUN_ID}`;
    // Libellé unique : l'assertion « pré-rempli » ne peut matcher que la copie.
    const LINE_LABEL = `Développement front ${RUN_ID}`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;
    let invoiceId: string;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-dup-${RUN_ID}@freelanceflow.test`,
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
        data: { userId: user.id, name: `Client dup ${RUN_ID}` },
        select: { id: true },
      });
      clientId = client.id;

      const project = await prisma.project.create({
        data: {
          userId: user.id,
          clientId: client.id,
          name: `Projet dup ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectId = project.id;

      // Facture ÉMISE et PAYÉE — le bouton « Dupliquer » est actif pour tout
      // document, on prend le cas le plus riche (numéro + dates posés).
      // Quantité décimale + taux variés : l'aperçu de l'éditeur recalcule le
      // TTC depuis les lignes copiées, le montant asserté (837,21) prouve la
      // fidélité de la copie EN CENTIMES :
      //   1,5 × 400,00 € @20 %  -> HT 600,00 + TVA 120,00
      //   2   ×  55,55 € @5,5 % -> HT 111,10 + TVA   6,11
      //   => TTC 837,21 €.
      const invoice = await prisma.document.create({
        data: {
          userId: user.id,
          projectId: project.id,
          type: "facture",
          status: "paye",
          number: INVOICE_NUMBER,
          object: `Maintenance mensuelle ${RUN_ID}`,
          tvaRegime: "reel",
          issuedAt: new Date(),
          dueAt: new Date(),
          paidAt: new Date(),
          totalHtCents: 71_110,
          totalTvaCents: 12_611,
          totalTtcCents: 83_721,
          lines: {
            create: [
              {
                userId: user.id,
                label: LINE_LABEL,
                quantity: 1.5,
                unitPriceCents: 40_000,
                tvaRate: 20,
                position: 0,
              },
              {
                userId: user.id,
                label: `Hébergement annuel ${RUN_ID}`,
                quantity: 2,
                unitPriceCents: 5_555,
                tvaRate: 5.5,
                position: 1,
              },
            ],
          },
        },
        select: { id: true },
      });
      invoiceId = invoice.id;
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté. Documents d'abord (lignes en CASCADE),
      // puis projet, puis client.
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

    test("vue facture -> « Dupliquer » (panneau) ouvre l'éditeur pré-rempli ; /factures gagne un brouillon", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/factures/${invoiceId}`);

      // La vue de la facture est rendue (numéro visible) et le bouton du
      // panneau est ACTIF — nom accessible EXACT « Dupliquer » (les autres
      // boutons de duplication portent le numéro dans leur nom).
      await expect(page.getByText(INVOICE_NUMBER).first()).toBeVisible();
      const duplicateBtn = page.getByRole("button", {
        name: "Dupliquer",
        exact: true,
      });
      await expect(duplicateBtn).toBeVisible();
      await expect(duplicateBtn).toBeEnabled();

      // Clic -> la server action crée le brouillon puis pousse vers l'éditeur.
      await duplicateBtn.click();
      await page.waitForURL(/\/documents\/nouveau\?document=/, {
        timeout: 15_000,
      });

      // Lignes de la facture PRÉ-REMPLIES : le libellé unique apparaît (aperçu
      // A4) et le total TTC recalculé en live depuis les lignes copiées est
      // EXACTEMENT celui de l'original (837,21 €) — une copie infidèle
      // (centimes, quantité décimale, taux) donnerait un autre montant.
      await expect(page.getByText(LINE_LABEL).first()).toBeVisible();
      await expect(page.getByText(/837,21/).first()).toBeVisible();

      // La liste /factures compte désormais UN brouillon (la copie) en plus de
      // la facture d'origine. On compte les LIGNES contenant « Brouillon »
      // (une même ligne l'affiche deux fois : cellule pièce + tag de statut —
      // un getByText exact matcherait donc 2 éléments pour un seul brouillon).
      await page.goto("/factures");
      await expect(page.getByText(INVOICE_NUMBER).first()).toBeVisible();
      await expect(
        page.getByRole("row").filter({ hasText: "Brouillon" }),
      ).toHaveCount(1);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("liste /factures -> bouton de ligne « Dupliquer FAC-… » (aria-label) ouvre l'éditeur pré-rempli", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/factures");

      // Bouton PAR LIGNE, visé par son aria-label EXACT (celui du brouillon
      // créé au test précédent est « Dupliquer ce brouillon » — pas lui).
      const rowBtn = page.getByRole("button", {
        name: `Dupliquer ${INVOICE_NUMBER}`,
        exact: true,
      });
      await expect(rowBtn).toBeVisible();
      await expect(rowBtn).toBeEnabled();

      // CI (runner lent) : le clic peut partir AVANT la fin de l'hydratation
      // React — le handler n'est pas encore attaché, le clic est muet et la
      // navigation n'arrive jamais (flaky observé sur main depuis l'ajout du
      // JS client Sentry, #88). On re-clique donc tant que l'URL n'a pas
      // changé : aucun risque de double duplication, le bouton est `disabled`
      // pendant l'action en vol (un clic Playwright sur bouton désactivé ne
      // déclenche rien, il expire).
      await expect(async () => {
        if (!/\/documents\/nouveau\?document=/.test(page.url())) {
          await rowBtn.click({ timeout: 2_000 });
        }
        await page.waitForURL(/\/documents\/nouveau\?document=/, {
          timeout: 5_000,
        });
      }).toPass({ timeout: 40_000 });

      // Éditeur pré-rempli avec les lignes copiées (libellé + TTC exact).
      await expect(page.getByText(LINE_LABEL).first()).toBeVisible();
      await expect(page.getByText(/837,21/).first()).toBeVisible();

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
