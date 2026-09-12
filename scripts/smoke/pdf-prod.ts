// Test de fumée PDF contre un environnement DÉPLOYÉ (issue #103).
//
// Pourquoi ce script existe : les E2E tournent sur un serveur local, où
// node_modules est complet. Un défaut d'empaquetage (Chromium absent de la
// fonction déployée) y est invisible — il a laissé le PDF cassé en production
// alors que toute la CI était verte. Ce script vérifie ce que voit réellement
// un utilisateur : téléchargement du PDF d'un document émis et export PDF des
// rapports, sur l'URL déployée.
//
// Déroulé : compte JETABLE créé (e-mail confirmé) → client, projet et facture
// émise semés en base → connexion par le vrai formulaire → 2 téléchargements
// (200 + signature %PDF) → suppression complète du compte, quoi qu'il arrive.
//
// Usage (environnement de la cible, jamais committé) :
//   SMOKE_BASE_URL=https://<domaine> bun --env-file=.env.production scripts/smoke/pdf-prod.ts
// Sortie : exit 0 si tout est vert, 1 sinon.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env.SMOKE_BASE_URL;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!BASE_URL || !supabaseUrl || !secretKey || !process.env.DATABASE_URL) {
    console.error(
      "SMOKE_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY et DATABASE_URL sont requis.",
    );
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });
  const prisma = new PrismaClient();
  const email = `smoke-pdf-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Smoke-${randomUUID()}`;
  let userId: string | null = null;
  let failures = 0;

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Test de fumée PDF" },
    });
    if (error || !data?.user) throw new Error(`createUser: ${error?.message}`);
    userId = data.user.id;
    // Laisse le trigger on_auth_user_created créer le profil public.users.
    await new Promise((r) => setTimeout(r, 1000));

    const client = await prisma.client.create({
      data: { userId, name: "Client fumée SARL", address: "1 rue du Test, Lyon" },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: "Mission fumée" },
    });
    const now = new Date();
    const doc = await prisma.document.create({
      data: {
        userId,
        projectId: project.id,
        type: "facture",
        number: "FAC-2026-001",
        status: "envoye",
        object: "Test de fumée",
        tvaRegime: "reel",
        totalHtCents: 10000,
        totalTvaCents: 2000,
        totalTtcCents: 12000,
        issuedAt: now,
        emittedAt: now,
        dueAt: new Date(now.getTime() + 30 * 86400_000),
        lines: {
          create: [
            {
              userId,
              label: "Prestation",
              quantity: 1,
              unitPriceCents: 10000,
              tvaRate: 20,
              position: 0,
            },
          ],
        },
      },
    });

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/connexion`);
      await page.getByLabel("Adresse e-mail").fill(email);
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

      const targets = [
        { label: "PDF document", path: `/api/documents/${doc.id}/pdf` },
        { label: "PDF rapports", path: "/api/rapports/pdf" },
      ];
      for (const t of targets) {
        const started = Date.now();
        const res = await page.request.get(`${BASE_URL}${t.path}`, {
          timeout: 90_000,
        });
        const body = await res.body();
        const ok =
          res.status() === 200 &&
          (res.headers()["content-type"] ?? "").includes("application/pdf") &&
          body.subarray(0, 4).toString() === "%PDF";
        const detail = ok
          ? `${body.length} octets`
          : body.toString("utf8").slice(0, 200);
        console.log(
          `${ok ? "OK  " : "ECHEC"} ${t.label} — HTTP ${res.status()} en ${Date.now() - started} ms — ${detail}`,
        );
        if (!ok) failures++;
      }
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("Erreur du test de fumée :", e instanceof Error ? e.message : e);
    failures++;
  } finally {
    if (userId) {
      // Enfants → parents (RESTRICT transitif documents ← projets ← clients).
      await prisma.document.deleteMany({ where: { userId } });
      await prisma.project.deleteMany({ where: { userId } });
      await prisma.client.deleteMany({ where: { userId } });
      await admin.auth.admin.deleteUser(userId);
    }
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "Résultat : tout est vert." : `Résultat : ${failures} échec(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
