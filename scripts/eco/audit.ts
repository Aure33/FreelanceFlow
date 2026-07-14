// Audit EcoIndex des pages clés (issue #62) — mesure RÉELLE en navigateur.
//
// Pour chaque page : chargement À FROID (contexte neuf, cache vide), puis
//   - éléments DOM   : document.querySelectorAll("*").length
//   - requêtes HTTP  : réponses réseau reçues jusqu'à networkidle
//   - poids transféré: somme des tailles de corps de réponses (octets encodés,
//     compression comprise — request.sizes() de Playwright)
// puis score et grade EcoIndex via la formule officielle (`ecoindex.ts`).
//
// Les pages de l'app sont mesurées avec un compte ÉPHÉMÈRE SEMÉ (client,
// projet, documents émis) créé sur le projet Supabase de DEV — jamais la prod
// (#17) — et supprimé à la fin. Résultats à reporter dans docs/ecoindex.md.
//
// Prérequis : build de prod qui tourne (`bun run build && bun run start -- -p 3199`)
//             + .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
//             DATABASE_URL). Usage : bun scripts/eco/audit.ts

import { chromium, type Browser, type BrowserContext } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import {
  computeEcoIndexScore,
  ecoIndexGrade,
  greenhouseGasesGrams,
  waterCentiliters,
} from "./ecoindex";

const BASE_URL = process.env.ECO_BASE_URL ?? "http://localhost:3199";

// Pages du parcours réel : publiques puis application (authentifiées).
const PUBLIC_PAGES = ["/", "/connexion", "/inscription"];
const APP_PAGES = [
  "/dashboard",
  "/clients",
  "/projets",
  "/factures",
  "/devis",
  "/documents/nouveau",
  "/rapports",
  "/abonnement",
  "/parametres",
];

type Measure = {
  page: string;
  dom: number;
  requests: number;
  sizeKb: number;
  score: number;
  grade: string;
};

async function measurePage(
  browser: Browser,
  url: string,
  storageState?: string,
): Promise<Measure> {
  // Contexte neuf à chaque page = cache réseau vide = mesure à froid.
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();

  let requests = 0;
  let bytes = 0;
  const pending: Promise<void>[] = [];
  page.on("requestfinished", (req) => {
    requests += 1;
    pending.push(
      req
        .sizes()
        .then((s) => {
          bytes += Math.max(s.responseBodySize, 0) + Math.max(s.responseHeadersSize, 0);
        })
        .catch(() => {}),
    );
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await Promise.all(pending);
  const dom = await page.evaluate(() => document.querySelectorAll("*").length);
  await context.close();

  const sizeKb = bytes / 1024;
  const score = computeEcoIndexScore(dom, requests, sizeKb);
  return {
    page: new URL(url).pathname,
    dom,
    requests,
    sizeKb: Number(sizeKb.toFixed(1)),
    score: Number(score.toFixed(1)),
    grade: ecoIndexGrade(score),
  };
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();

  const runId = Date.now().toString(36);
  const email = `eco-audit-${runId}@freelanceflow.test`;
  const password = `Eco-62-${runId}-Aa1!`;

  // --- Compte éphémère semé (dashboard/listes représentatifs, pas vides) ------
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Éco Audit" },
  });
  if (error || !data?.user) throw new Error(`createUser: ${error?.message}`);
  const userId = data.user.id;
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch();
  const results: Measure[] = [];
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { siret: "12345678900011", address: "1 rue de l'Audit, 33000 Bordeaux" },
    });
    const client = await prisma.client.create({
      data: { userId, name: "Client Éco SARL", address: "2 av. Verte, Lyon" },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: "Mission audit" },
    });
    const now = new Date();
    for (let i = 1; i <= 6; i++) {
      const type = i % 2 ? "facture" : "devis";
      const emitted = new Date(now.getTime() - i * 12 * 86400_000);
      await prisma.document.create({
        data: {
          userId,
          projectId: project.id,
          type,
          number: `${type === "facture" ? "FAC" : "DEV"}-2026-00${i}`,
          status: i <= 2 ? "paye" : "envoye",
          tvaRegime: "reel",
          totalHtCents: 120_000 * i,
          totalTvaCents: 24_000 * i,
          totalTtcCents: 144_000 * i,
          issuedAt: emitted,
          emittedAt: emitted,
          dueAt: new Date(emitted.getTime() + 30 * 86400_000),
          paidAt: i <= 2 ? now : null,
          lines: {
            create: {
              userId,
              label: `Prestation ${i}`,
              quantity: 1,
              unitPriceCents: 120_000 * i,
              tvaRate: 20,
            },
          },
        },
      });
    }

    // --- Pages publiques (sans session) ----------------------------------------
    for (const p of PUBLIC_PAGES) {
      results.push(await measurePage(browser, `${BASE_URL}${p}`));
    }

    // --- Connexion puis pages app (cookie de session réutilisé, cache vide) ----
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${BASE_URL}/connexion`);
    await loginPage.getByLabel("Adresse e-mail").fill(email);
    await loginPage.getByLabel("Mot de passe").fill(password);
    await loginPage.getByRole("button", { name: /se connecter/i }).click();
    await loginPage.waitForURL(/\/dashboard/, { timeout: 20000 });
    const statePath = "/tmp/eco-audit-state.json";
    await loginContext.storageState({ path: statePath });
    await loginContext.close();

    for (const p of APP_PAGES) {
      results.push(await measurePage(browser, `${BASE_URL}${p}`, statePath));
    }
  } finally {
    await browser.close();
    // Nettoyage : enfants → parents, puis user Auth (cascade public.users).
    await prisma.documentLine.deleteMany({ where: { userId } });
    await prisma.document.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.client.deleteMany({ where: { userId } });
    await prisma.$disconnect();
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }

  // --- Rapport markdown (à coller dans docs/ecoindex.md) -------------------------
  console.log("\n| Page | DOM | Requêtes | Poids (Ko) | Score | Grade | GES (g éqCO₂) | Eau (cl) |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(
      `| \`${r.page}\` | ${r.dom} | ${r.requests} | ${r.sizeKb} | ${r.score} | **${r.grade}** | ${greenhouseGasesGrams(r.score)} | ${waterCentiliters(r.score)} |`,
    );
  }
  const worst = results.reduce((a, b) => (a.score < b.score ? a : b));
  console.log(`\nPire page : ${worst.page} (score ${worst.score}, grade ${worst.grade})`);
  if (worst.score <= 70) {
    console.error("⚠️ Objectif EcoIndex ≥ B (score > 70) NON atteint partout.");
    process.exit(1);
  }
  console.log("✅ Objectif EcoIndex ≥ B atteint sur toutes les pages mesurées.");
}

main();
