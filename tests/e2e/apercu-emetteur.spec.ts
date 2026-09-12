import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { formatSiret } from "../../components/clients/format";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Aperçu A4 de l'éditeur : vraies coordonnées de l'émetteur (issue #105).
//
// L'aperçu temps réel de /documents/nouveau portait des textes codés en dur
// (« SIRET à compléter », « TVA à compléter »…) datant d'avant les Paramètres
// (#12), alors que le profil était rempli. Ces tests prouvent, sur données
// réelles, que :
//   ① profil rempli -> l'aperçu affiche nom, adresse, SIRET formaté, IBAN, BIC,
//     l'adresse du client, « Facturé à », « Numéro attribué à l'émission » et
//     AUCUN placeholder « à compléter » ;
//   ② type devis -> libellés « Adressé à » / « Validité » (jamais « Facturé à ») ;
//   ③ profil vide -> placeholders « … à compléter dans Paramètres » (légitimes
//     cette fois), toujours sans « TVA à compléter » ;
//   ④ document émis -> ni « TVA à compléter », SIRET formaté présent.
//
// NOTE STATUT HTTP (#56) : pages streamées -> on n'asserte que le RENDU.
//
// Secrets nécessaires : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL (.env.local, jamais committé). Absents -> suite SKIPPÉE.
// ⚠️ Lancer avec `set -a && . ./.env.local && set +a` sinon faux vert (skip).
// Projet Supabase "dev" uniquement (#17). Données nettoyées en afterAll.

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

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const IGNORED = [/favicon/i, /Failed to load resource|404/];
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
  test.describe.skip("Aperçu émetteur de l'éditeur (#105)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Aperçu émetteur de l'éditeur (#105)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-apercu-${RUN_ID}-Aa1!`;

    // Profil émetteur semé (valeurs uniques par run -> aucune collision possible
    // avec un texte existant de la page).
    const PROFILE = {
      name: `Studio Aperçu ${RUN_ID}`,
      address: `12 rue du Test ${RUN_ID}, 33000 Bordeaux`,
      siret: "84251963700014",
      iban: "FR7630006000011234567890189",
      bic: "AGRIFRPPXXX",
    };
    const EXPECTED_SIRET = `SIRET ${formatSiret(PROFILE.siret)}`;
    const CLIENT_ADDRESS = `5 avenue Client ${RUN_ID}, 75001 Paris`;
    const SEEDED_NUMBER = `FAC-2026-001`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let filled: { id: string; email: string };
    let empty: { id: string; email: string };
    let clientId: string | undefined;
    let projectId: string | undefined;
    let invoiceId: string;

    async function createUser(tag: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-apercu-${tag}-${RUN_ID}@freelanceflow.test`,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) {
        throw new Error(`Création de l'utilisateur a échoué : ${error?.message}`);
      }
      return { id: data.user.id, email: data.user.email! };
    }

    test.beforeAll(async () => {
      filled = await createUser("a");
      empty = await createUser("b");

      // Laisse le trigger `on_auth_user_created` créer les lignes public.users.
      await new Promise((resolve) => setTimeout(resolve, 800));

      await prisma.user.update({ where: { id: filled.id }, data: PROFILE });
      // Profil explicitement vide pour le second compte.
      await prisma.user.update({
        where: { id: empty.id },
        data: { name: null, address: null, siret: null, iban: null, bic: null },
      });

      const client = await prisma.client.create({
        data: {
          userId: filled.id,
          name: `Client aperçu ${RUN_ID}`,
          address: CLIENT_ADDRESS,
        },
        select: { id: true },
      });
      clientId = client.id;

      const project = await prisma.project.create({
        data: {
          userId: filled.id,
          clientId: client.id,
          name: `Projet aperçu ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectId = project.id;

      const invoice = await prisma.document.create({
        data: {
          userId: filled.id,
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
                userId: filled.id,
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
      invoiceId = invoice.id;
    });

    test.afterAll(async () => {
      // Ordre RESTRICT : documents (cascade lignes) -> projet -> client -> users.
      for (const u of [filled, empty]) {
        try {
          if (u?.id) await prisma.document.deleteMany({ where: { userId: u.id } });
        } catch (e) {
          console.warn("Nettoyage documents échoué :", e);
        }
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
      for (const u of [filled, empty]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn("Suppression user échouée :", e);
        }
      }
    });

    const preview = (page: Page) =>
      page.getByRole("region", { name: "Aperçu du document en temps réel" });

    test("facture, profil rempli : l'aperçu affiche les vraies coordonnées, aucun placeholder", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, filled.email, PASSWORD);
      await page.goto(`/documents/nouveau?projet=${projectId}`);

      const region = preview(page);
      await expect(region).toBeVisible({ timeout: 15_000 });
      // Le projet est bien présélectionné (sinon l'adresse client ne peut pas
      // apparaître et le test ne prouverait rien).
      await expect(region).toContainText(CLIENT_ADDRESS, { timeout: 15_000 });

      await expect(region).toContainText(PROFILE.name);
      await expect(region).toContainText(PROFILE.address);
      await expect(region).toContainText(EXPECTED_SIRET);
      await expect(region).toContainText(`IBAN ${PROFILE.iban}`);
      await expect(region).toContainText(`BIC ${PROFILE.bic}`);
      await expect(region).toContainText("Facturé à");
      await expect(region).toContainText("Numéro attribué à l'émission");

      await expect(region).not.toContainText("à compléter");
      await expect(region).not.toContainText("TVA à compléter");

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("devis : libellés « Adressé à » / « Validité », jamais « Facturé à »", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, filled.email, PASSWORD);
      await page.goto(`/documents/nouveau?projet=${projectId}&type=devis`);

      const region = preview(page);
      await expect(region).toContainText(CLIENT_ADDRESS, { timeout: 15_000 });
      await expect(region).toContainText("Adressé à");
      await expect(region).toContainText("Validité");
      await expect(region).not.toContainText("Facturé à");
      await expect(region).not.toContainText("Échéance");
      await expect(region).toContainText(EXPECTED_SIRET);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("profil vide : placeholders « à compléter dans Paramètres », sans « TVA à compléter »", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, empty.email, PASSWORD);
      await page.goto("/documents/nouveau");

      const region = preview(page);
      await expect(region).toBeVisible({ timeout: 15_000 });
      await expect(region).toContainText("SIRET à compléter dans Paramètres");
      await expect(region).toContainText("IBAN à compléter dans Paramètres");
      await expect(region).toContainText("Nom à compléter dans Paramètres");
      await expect(region).not.toContainText("TVA à compléter");
      // Aucune fuite des coordonnées de l'autre compte.
      await expect(region).not.toContainText(PROFILE.name);

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("facture émise : SIRET formaté présent, jamais « TVA à compléter »", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await loginAs(page, filled.email, PASSWORD);
      await page.goto(`/factures/${invoiceId}`);

      const main = page.locator("main");
      await expect(main.getByText(SEEDED_NUMBER).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(main).toContainText(EXPECTED_SIRET);
      await expect(main).toContainText(PROFILE.name);
      await expect(page.locator("body")).not.toContainText("TVA à compléter");

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
