// Audit d'accessibilité rejouable (RGAA 4.1 / WCAG 2.1 AA) — mêmes principes
// que l'audit EcoIndex (scripts/eco/audit.ts) : compte de test éphémère semé
// sur le projet Supabase de DEV, parcours d'un échantillon de pages
// représentatif, moteur axe-core exécuté sur chaque page dans les DEUX thèmes.
//
// Sortie : violations par page et par niveau d'impact, taux de pages sans
// violation. Sort avec le code 1 si une violation bloquante/critique subsiste
// (garde-fou : l'accessibilité ne doit pas régresser).
//
// Lancement : le serveur de prod doit tourner (ex. `bun run start -- -p 3199`).
//   bun scripts/a11y/audit.ts            # http://localhost:3199 par défaut
//   BASE_URL=... bun scripts/a11y/audit.ts
//
// axe-core couvre ~57 % des critères RGAA de façon automatique ; le solde
// (contraste en contexte, ordre de tabulation, pertinence des intitulés…) est
// vérifié manuellement — cf. le rapport Bloc 2, § 6.2.

import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

function loadDotEnvLocalIfPresent() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnvLocalIfPresent();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3199";
const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core");
// WCAG 2.0/2.1 niveaux A + AA — la base réglementaire du RGAA 4.1.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Impact = "minor" | "moderate" | "serious" | "critical";
type AxeResult = {
  violations: {
    id: string;
    impact: Impact | null;
    help: string;
    nodes: unknown[];
  }[];
};

async function runAxe(page: Page): Promise<AxeResult["violations"]> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = (await page.evaluate((tags) => {
    // @ts-expect-error axe est injecté dans la page
    return window.axe.run(document, {
      runOnly: { type: "tag", values: tags },
      resultTypes: ["violations"],
    });
  }, AXE_TAGS)) as AxeResult;
  return result.violations;
}

async function auditPage(
  page: Page,
  label: string,
  url: string,
): Promise<{ label: string; total: number; byImpact: Record<string, number> }> {
  const byImpact: Record<string, number> = {};
  let total = 0;
  for (const theme of ["light", "dark"] as const) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      localStorage.setItem("ff-theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }, theme);
    await page.waitForTimeout(300);
    const violations = await runAxe(page);
    for (const v of violations) {
      const impact = v.impact ?? "minor";
      byImpact[impact] = (byImpact[impact] ?? 0) + v.nodes.length;
      total += v.nodes.length;
    }
  }
  return { label, total, byImpact };
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const EMAIL = `a11y-${RUN}@freelanceflow.test`;
  const PASSWORD = `A11y-${RUN}-Aa1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data?.user) throw new Error(error?.message);
  const userId = data.user.id;
  await new Promise((r) => setTimeout(r, 400));
  const client = await prisma.client.create({
    data: { userId, name: `Studio Vega ${RUN}` },
    select: { id: true },
  });
  const project = await prisma.project.create({
    data: { userId, clientId: client.id, name: `Refonte ${RUN}` },
    select: { id: true },
  });
  const doc = await prisma.document.create({
    data: {
      userId,
      projectId: project.id,
      type: "facture",
      status: "envoye",
      number: `FAC-A11Y-${RUN}`,
      object: "Audit accessibilité",
      totalHtCents: 250_000,
      totalTvaCents: 50_000,
      totalTtcCents: 300_000,
      issuedAt: new Date(),
      emittedAt: new Date(),
      dueAt: new Date(Date.now() + 30 * 86_400_000),
    },
    select: { id: true },
  });
  await prisma.documentLine.create({
    data: {
      userId,
      documentId: doc.id,
      label: "Développement front",
      quantity: 5,
      unitPriceCents: 50_000,
      tvaRate: 20,
      position: 0,
    },
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results: Awaited<ReturnType<typeof auditPage>>[] = [];

  try {
    // Pages publiques (sans session).
    for (const [label, url] of [
      ["Landing", "/"],
      ["Connexion", "/connexion"],
      ["Inscription", "/inscription"],
      ["Mentions légales", "/legal"],
    ] as const) {
      results.push(await auditPage(page, label, `${BASE_URL}${url}`));
    }

    // Connexion puis pages applicatives.
    await page.goto(`${BASE_URL}/connexion`, { waitUntil: "networkidle" });
    await page.getByLabel("Adresse e-mail").fill(EMAIL);
    await page.getByLabel("Mot de passe").fill(PASSWORD);
    await page.getByRole("button", { name: /se connecter/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    for (const [label, url] of [
      ["Tableau de bord", "/dashboard"],
      ["Liste clients", "/clients"],
      ["Nouveau client", "/clients/nouveau"],
      ["Liste factures", "/factures"],
      ["Éditeur de document", "/documents/nouveau"],
      ["Vue facture", `/factures/${doc.id}`],
      ["Rapports", "/rapports"],
      ["Abonnement", "/abonnement"],
      ["Paramètres", "/parametres"],
    ] as const) {
      results.push(await auditPage(page, label, `${BASE_URL}${url}`));
    }
  } finally {
    await browser.close();
    await prisma.documentLine.deleteMany({ where: { userId } });
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.client.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    await prisma.$disconnect();
  }

  // Rapport.
  console.log("\nAudit accessibilité — axe-core (WCAG 2.1 A+AA, base RGAA 4.1)");
  console.log("Pages auditées dans les deux thèmes (clair + sombre).\n");
  let grandTotal = 0;
  let critical = 0;
  let cleanPages = 0;
  for (const r of results) {
    grandTotal += r.total;
    critical += (r.byImpact.critical ?? 0) + (r.byImpact.serious ?? 0);
    if (r.total === 0) cleanPages += 1;
    const detail =
      r.total === 0
        ? "✓ aucune violation"
        : Object.entries(r.byImpact)
            .map(([k, v]) => `${v} ${k}`)
            .join(", ");
    console.log(`  ${r.label.padEnd(24)} ${detail}`);
  }
  const rate = ((cleanPages / results.length) * 100).toFixed(0);
  console.log(
    `\n${cleanPages}/${results.length} pages sans aucune violation axe-core (${rate} %).`,
  );
  console.log(`Total violations : ${grandTotal} (dont ${critical} sérieuses/critiques).`);

  if (critical > 0) {
    console.error(
      "\n✗ Des violations sérieuses/critiques subsistent — accessibilité à corriger.",
    );
    process.exit(1);
  }
  console.log("\n✓ Aucune violation sérieuse ou critique.");
}

main();
