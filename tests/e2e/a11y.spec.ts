import { test, expect, type Page } from "playwright/test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// NOTE ENVIRONNEMENT (Bun, pas de Node dans WSL) : `tests/e2e/package.json`
// ({"type":"module"}) est nécessaire — voir documents-pdf.spec.ts.
//
// -----------------------------------------------------------------------------
// Accessibilité (issue #98) — garde-fou CI contre les régressions de contraste
// et autres violations WCAG 2.1 AA détectables automatiquement.
//
// Moteur axe-core (le même que l'audit rejouable `scripts/a11y/audit.ts`,
// ~57 % des critères RGAA couverts automatiquement — le solde est vérifié
// manuellement, cf. rapport § 6.2). Échantillon de pages représentatif, dans
// les DEUX thèmes. Assertion : ZÉRO violation sérieuse ou critique.
//
// Secrets Supabase absents (#17) -> suite SKIPPÉE proprement.

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Violation = { id: string; impact: string | null; nodes: unknown[] };

async function seriousViolations(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      localStorage.setItem("ff-theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }, theme);
    await page.waitForTimeout(250);
    await page.addScriptTag({ path: AXE_PATH });
    const violations = (await page.evaluate((tags) => {
      // @ts-expect-error axe injecté dans la page
      return window.axe
        .run(document, {
          runOnly: { type: "tag", values: tags },
          resultTypes: ["violations"],
        })
        .then((r: { violations: Violation[] }) => r.violations);
    }, AXE_TAGS)) as Violation[];
    for (const v of violations) {
      if (v.impact === "serious" || v.impact === "critical") {
        out.push(`[${theme}] ${v.id} (${v.nodes.length}×)`);
      }
    }
  }
  return out;
}

if (!hasEnv) {
  test.describe.skip("Accessibilité — axe-core (#98)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  test.describe("Accessibilité — axe-core (#98)", () => {
    const RUN = randomUUID().slice(0, 8);
    const EMAIL = `test-a11y-${RUN}@freelanceflow.test`;
    const PASSWORD = `Test-a11y-${RUN}-Aa1!`;
    const admin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
    const prisma = new PrismaClient();
    let userId = "";
    let invoiceId = "";

    test.beforeAll(async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(error?.message);
      userId = data.user.id;
      await new Promise((r) => setTimeout(r, 500));
      const client = await prisma.client.create({
        data: { userId, name: `Client A11y ${RUN}` },
        select: { id: true },
      });
      const project = await prisma.project.create({
        data: { userId, clientId: client.id, name: `Projet A11y ${RUN}` },
        select: { id: true },
      });
      const doc = await prisma.document.create({
        data: {
          userId,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: `FAC-A11Y-${RUN}`,
          object: "Audit",
          totalHtCents: 250_000,
          totalTvaCents: 50_000,
          totalTtcCents: 300_000,
          issuedAt: new Date(),
          emittedAt: new Date(),
          dueAt: new Date(Date.now() + 30 * 86_400_000),
        },
        select: { id: true },
      });
      invoiceId = doc.id;
      await prisma.documentLine.create({
        data: {
          userId,
          documentId: invoiceId,
          label: "Développement",
          quantity: 5,
          unitPriceCents: 50_000,
          tvaRate: 20,
          position: 0,
        },
      });
    });

    test.afterAll(async () => {
      try {
        if (userId) {
          await prisma.documentLine.deleteMany({ where: { userId } });
          await prisma.document.deleteMany({ where: { userId } });
          await prisma.project.deleteMany({ where: { userId } });
          await prisma.client.deleteMany({ where: { userId } });
          await prisma.user.deleteMany({ where: { id: userId } });
          await admin.auth.admin.deleteUser(userId).catch(() => {});
        }
      } catch {
        /* nettoyage tolérant */
      }
      await prisma.$disconnect();
    });

    test("zéro violation sérieuse/critique (WCAG 2.1 AA) sur l'échantillon, 2 thèmes", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      // Pages publiques.
      for (const path of ["/", "/connexion", "/inscription"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        expect(
          await seriousViolations(page),
          `violations a11y sur ${path}`,
        ).toEqual([]);
      }

      // Connexion + pages applicatives.
      await page.goto("/connexion");
      await page.getByLabel("Adresse e-mail").fill(EMAIL);
      await page.getByLabel("Mot de passe").fill(PASSWORD);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

      for (const path of [
        "/dashboard",
        "/documents/nouveau",
        `/factures/${invoiceId}`,
        "/parametres",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(300);
        expect(
          await seriousViolations(page),
          `violations a11y sur ${path}`,
        ).toEqual([]);
      }
    });
  });
}
