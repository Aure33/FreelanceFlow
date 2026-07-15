import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire à côté de ce fichier — voir l'explication
// détaillée dans `documents-pdf.spec.ts`.
//
// -----------------------------------------------------------------------------
// Segments de période réels (issue #65) — parcours utilisateur via l'UI.
//
// Un VRAI utilisateur éphémère (API admin Supabase) avec fixtures Prisma
// légères (1 client, 1 projet, 3 factures payées : ce mois, il y a 5 mois,
// l'an dernier — la 3ᵉ rend le delta « année » calculable, donc le pied du
// KPI 1 affiche bien « vs année dernière » au lieu du repli « Aucune
// donnée... ») :
//   - /dashboard : « Ce mois » actif par défaut (aria-pressed), clic « Année »
//     → ?periode=annee dans l'URL, pied de KPI « vs année dernière »,
//     « Top clients · cette année » ; RELOAD → sélection conservée (l'URL est
//     la source de vérité, pas un state local) ;
//   - /rapports : clic « Trimestre » → ?periode=trimestre, sous-titre
//     « trimestre en cours (T… », lien « Exporter en PDF » qui EMPORTE la
//     période ; retour « Année 20xx » → URL propre SANS paramètre ;
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
  test.describe.skip("Segments de période (#65)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe.configure({ mode: "serial" });

  test.describe("Segments de période (#65)", () => {
    const RUN_ID = randomUUID().slice(0, 8);
    const PASSWORD = `Test-periods-${RUN_ID}-Aa1!`;

    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();

    let user: { id: string; email: string };

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `test-periods-${RUN_ID}@freelanceflow.test`,
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
        data: { userId: user.id, name: `Client Périodes ${RUN_ID}` },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: {
          userId: user.id,
          clientId: client.id,
          name: `Projet Périodes ${RUN_ID}`,
        },
        select: { id: true },
      });

      // 3 factures payées, placées en RELATIF à la date d'exécution (UTC,
      // comme les fenêtres de lib/periods) :
      //  - ce mois-ci (1er du mois + 1 h) ;
      //  - il y a 5 mois (hors mois et hors trimestre courants) ;
      //  - l'an dernier (15 juin N-1 → delta « année » calculable).
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const paidDates = [
        new Date(Date.UTC(y, m, 1, 1)),
        new Date(Date.UTC(y, m - 5, 10)),
        new Date(Date.UTC(y - 1, 5, 15)),
      ];
      let i = 0;
      for (const paidAt of paidDates) {
        i += 1;
        await prisma.document.create({
          data: {
            userId: user.id,
            projectId: project.id,
            type: "facture",
            status: "paye",
            number: `FAC-PER-${i}`,
            totalHtCents: 60_000,
            totalTvaCents: 12_000,
            totalTtcCents: 72_000,
            issuedAt: paidAt,
            emittedAt: paidAt,
            paidAt,
          },
          select: { id: true },
        });
      }
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
        console.warn("Nettoyage données périodes échoué :", e);
      }
      await prisma.$disconnect();
      try {
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("Suppression user périodes échouée :", e);
      }
    });

    test("dashboard : « Ce mois » par défaut, clic « Année » → URL ?periode=annee, libellés année, sélection conservée au reload", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);

      // Segment de période du dashboard (groupe accessible dédié).
      const segment = page.getByRole("group", { name: "Période affichée" });
      await expect(segment).toBeVisible();

      // Défaut : « Ce mois » actif (aria-pressed), pas les deux autres.
      await expect(
        segment.getByRole("button", { name: "Ce mois" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        segment.getByRole("button", { name: "Année", exact: true }),
      ).toHaveAttribute("aria-pressed", "false");

      // Clic « Année » : la sélection vit dans l'URL (?periode=annee).
      await segment.getByRole("button", { name: "Année", exact: true }).click();
      await page.waitForURL(/\/dashboard\?periode=annee/, { timeout: 15_000 });
      await expect(
        segment.getByRole("button", { name: "Année", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");

      // Le serveur a re-rendu la page pour la période : pied du KPI 1 (le
      // delta est calculable grâce à la facture payée l'an dernier) + carte
      // top clients suffixée par la plage.
      await expect(page.getByText("vs année dernière")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("Top clients · cette année")).toBeVisible();

      // RELOAD : l'URL est la source de vérité, la sélection est conservée.
      await page.reload();
      await expect(
        page
          .getByRole("group", { name: "Période affichée" })
          .getByRole("button", { name: "Année", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("vs année dernière")).toBeVisible({
        timeout: 15_000,
      });
      expect(page.url()).toContain("periode=annee");

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });

    test("rapports : « Trimestre » → ?periode=trimestre + export PDF paramétré ; retour « Année 20xx » → URL propre", async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);

      await loginAs(page, user.email, PASSWORD);
      await page.goto("/rapports");

      const segment = page.getByRole("group", { name: "Période du rapport" });
      await expect(segment).toBeVisible();

      // Défaut : « Année 20xx » actif, sous-titre « année 20xx ».
      const yearButton = segment.getByRole("button", { name: /^Année 20\d{2}$/ });
      await expect(yearButton).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText(/année 20\d{2}\./)).toBeVisible();

      // Clic « Trimestre » : URL, sous-titre « trimestre en cours (T… », et le
      // lien « Exporter en PDF » emporte la période sélectionnée.
      await segment.getByRole("button", { name: "Trimestre" }).click();
      await page.waitForURL(/\/rapports\?periode=trimestre/, { timeout: 15_000 });
      await expect(
        segment.getByRole("button", { name: "Trimestre" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByText(/trimestre en cours \(T[1-4] 20\d{2}\)/),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("link", { name: /exporter en pdf/i }),
      ).toHaveAttribute("href", "/api/rapports/pdf?periode=trimestre");

      // Retour « Année 20xx » : URL PROPRE (le défaut ne traîne pas en
      // paramètre), sous-titre et export PDF redevenus « année ».
      await yearButton.click();
      await page.waitForURL(
        (url) => url.pathname === "/rapports" && !url.searchParams.has("periode"),
        { timeout: 15_000 },
      );
      await expect(yearButton).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText(/année 20\d{2}\./)).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("link", { name: /exporter en pdf/i }),
      ).toHaveAttribute("href", "/api/rapports/pdf");

      expect(errors, `Erreurs console détectées :\n${errors.join("\n")}`).toEqual([]);
    });
  });
}
