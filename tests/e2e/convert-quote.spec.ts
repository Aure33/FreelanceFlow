import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Conversion devis → facture (issue #61) — parcours utilisateur réel.
//
// Un VRAI utilisateur (API admin Supabase) avec client → projet → devis ÉMIS et
// ACCEPTÉ (fabriqués via Prisma direct, comme documents-pdf.spec.ts) :
//   - la vue du devis montre « Convertir en facture » ACTIF ; le clic crée le
//     brouillon et atterrit sur l'éditeur `/documents/nouveau?document=<id>`
//     avec la mention « créé depuis le devis DEV-… » et les lignes du devis
//     pré-remplies (libellé + total TTC recalculé identique) ;
//   - de retour sur la vue du devis, le bouton est devenu « Voir le brouillon
//     de facture » (anti-double conversion, lien vers l'éditeur) ;
//   - zéro erreur console sur tout le parcours.
//
// NOTE STATUT HTTP (#56) : les pages streament (app/(app)/loading.tsx), on
// n'asserte donc JAMAIS de statut HTTP ici — uniquement le RENDU.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (chargés par Bun depuis .env.local, jamais committé). Absents
// -> suite SKIPPÉE proprement. ⚠️ Projet Supabase "dev" (jamais la prod, #17).
// Toutes les données créées sont nettoyées en afterAll (l'auto-référence
// sourceQuoteId est en ON DELETE SET NULL : un deleteMany global suffit).

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
  test.describe.skip("Conversion devis → facture (#61)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Conversion devis → facture (#61)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-conv-${RUN_ID}-Aa1!`;
    const QUOTE_NUMBER = `DEV-TEST-${RUN_ID}`;
    // Libellé unique : l'assertion « pré-rempli » ne peut matcher que la copie.
    const LINE_LABEL = `Conception maquettes ${RUN_ID}`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;
    let quoteId: string;

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-conv-${RUN_ID}@freelanceflow.test`,
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
        data: { userId: user.id, name: `Client conv ${RUN_ID}` },
        select: { id: true },
      });
      clientId = client.id;

      const project = await prisma.project.create({
        data: {
          userId: user.id,
          clientId: client.id,
          name: `Projet conv ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectId = project.id;

      // Devis ÉMIS (numéroté) et ACCEPTÉ — l'état exact qui active le bouton
      // « Convertir en facture ». Quantité décimale + taux variés : l'aperçu
      // de l'éditeur recalcule le TTC depuis les lignes copiées, le montant
      // asserté (837,21) prouve la fidélité de la copie EN CENTIMES :
      //   1,5 × 400,00 € @20 % -> HT 600,00 + TVA 120,00
      //   2   ×  55,55 € @5,5 % -> HT 111,10 + TVA   6,11
      //   => TTC 837,21 €.
      const quote = await prisma.document.create({
        data: {
          userId: user.id,
          projectId: project.id,
          type: "devis",
          status: "accepte",
          number: QUOTE_NUMBER,
          object: `Refonte du site vitrine ${RUN_ID}`,
          tvaRegime: "reel",
          issuedAt: new Date(),
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
      quoteId = quote.id;
    });

    test.afterAll(async () => {
      // Nettoyage — toujours exécuté. Documents d'abord (lignes en CASCADE,
      // auto-référence sourceQuoteId en SET NULL), puis projet, puis client.
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

    test("devis accepté -> « Convertir en facture » ouvre l'éditeur pré-rempli depuis le devis", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/devis/${quoteId}`);

      // La vue du devis est rendue (numéro visible) et le bouton est ACTIF.
      await expect(page.getByText(QUOTE_NUMBER).first()).toBeVisible();
      const convertBtn = page.getByRole("button", {
        name: /convertir en facture/i,
      });
      await expect(convertBtn).toBeVisible();
      await expect(convertBtn).toBeEnabled();

      // Clic -> la server action crée le brouillon puis pousse vers l'éditeur.
      await convertBtn.click();
      await page.waitForURL(/\/documents\/nouveau\?document=/, {
        timeout: 15_000,
      });

      // Traçabilité affichée : l'éditeur annonce le devis d'origine.
      await expect(page.getByText(/créé depuis le devis/i)).toBeVisible();
      await expect(page.getByText(QUOTE_NUMBER).first()).toBeVisible();

      // Lignes du devis PRÉ-REMPLIES : le libellé apparaît (aperçu A4) et le
      // total TTC recalculé en live depuis les lignes copiées est EXACTEMENT
      // celui du devis (837,21 €) — une copie infidèle (centimes, quantité
      // décimale, taux) donnerait un autre montant.
      await expect(page.getByText(LINE_LABEL).first()).toBeVisible();
      await expect(page.getByText(/837,21/).first()).toBeVisible();

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("retour sur le devis -> le bouton est devenu « Voir le brouillon de facture »", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto(`/devis/${quoteId}`);

      await expect(page.getByText(QUOTE_NUMBER).first()).toBeVisible();

      // Anti-double conversion côté UI : plus de bouton « Convertir », un lien
      // vers le brouillon de facture le remplace (l'éditeur, pas la vue).
      const seeDraft = page.getByRole("link", {
        name: /voir le brouillon de facture/i,
      });
      await expect(seeDraft).toBeVisible();
      await expect(seeDraft).toHaveAttribute(
        "href",
        /\/documents\/nouveau\?document=/,
      );
      await expect(
        page.getByRole("button", { name: /convertir en facture/i }),
      ).toHaveCount(0);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
