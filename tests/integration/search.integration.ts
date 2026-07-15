// -----------------------------------------------------------------------------
// Recherche globale ⌘K (issue #63) — tests d'intégration de la server action
// `searchAll()` (app/(app)/search.ts).
//
// Ce qu'on prouve, avec DEUX utilisateurs réels (Supabase Auth + Prisma réel) :
//   - MATCH PAR FAMILLE : clients par nom, projets par titre (avec le nom du
//     client), documents par NUMÉRO uniquement — un brouillon sans numéro ne
//     remonte JAMAIS dans la famille documents.
//   - ISOLATION (critique, Prisma contourne la RLS) : chaque requête est
//     filtrée `where: { userId }` → un terme de recherche, même exact, ne
//     remonte JAMAIS une donnée d'autrui (ni client, ni projet, ni document).
//   - INSENSIBILITÉ À LA CASSE : « ACME » ≡ « acme », « fac-2099-101 » trouve
//     FAC-2099-101.
//   - GARDE-FOUS zod : vide / 1 caractère / espaces seuls / > 80 caractères →
//     résultats VIDES (pas d'exception, pas de scan large) ; les espaces autour
//     d'une requête valide sont trimés.
//   - LIMITE take: 5 par famille (éco-conception) : 7 clients qui matchent →
//     exactement 5 renvoyés.
//
// Même patron que tests/integration/crud-edit-delete.integration.ts : mock de
// la session posé AVANT l'import dynamique de l'action ; extension
// `.integration.ts` (jamais découvert par `bun test` nu — lancé via
// `bun run test:integration`) ; secrets lus depuis .env.local, suite SKIPPÉE
// proprement s'ils manquent ; tout ce qui est créé est nettoyé en afterAll
// (ordre RESTRICT : documents -> projets -> clients -> users Auth).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SearchResults } from "@/app/(app)/search";

const TIMEOUT = 30_000; // écritures réseau réelles (Supabase + Prisma)

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

const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// Le contrat « résultats vides » des garde-fous d'entrée.
const EMPTY: SearchResults = { clients: [], projects: [], documents: [] };

if (!hasEnv) {
  describe.skip("Recherche globale ⌘K (#63)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mock du contexte requête HTTP, AVANT tout import de l'action ---------
  // `activeUserId` est mutée entre les tests pour rejouer searchAll "en tant
  // que" A ou B — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  // Import DYNAMIQUE (après le mock : un import statique serait hoisté avant
  // mock.module par le moteur JS et capterait la vraie session).
  const { searchAll } = await import("@/app/(app)/search");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-search-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-search-${slug}-${RUN_ID}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(
        `Création de l'utilisateur ${slug} a échoué : ${error?.message}`,
      );
    }
    return { id: data.user.id, email };
  }

  describe("Recherche globale ⌘K (#63)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };

    // Ids des fixtures utiles aux assertions négatives (jamais dans les résultats).
    let draftAId = ""; // brouillon de A, SANS numéro
    let docB102Id = ""; // FAC-2099-102 — appartient à B

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");

      // Laisse le trigger `on_auth_user_created` créer les lignes public.users
      // avant d'y référencer des clients/projets/documents.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ---- Fixtures de A --------------------------------------------------
      const acme = await prisma.client.create({
        data: { userId: userA.id, name: "Acme Studio" },
        select: { id: true },
      });
      await prisma.client.create({
        data: { userId: userA.id, name: "Bureau Nord" },
        select: { id: true },
      });
      const refonte = await prisma.project.create({
        data: {
          userId: userA.id,
          clientId: acme.id,
          name: "Refonte Acme site",
        },
        select: { id: true },
      });
      // 2 documents ÉMIS (numérotés) + 1 brouillon SANS numéro.
      await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: refonte.id,
          type: "facture",
          status: "envoye",
          number: "FAC-2099-101",
          issuedAt: new Date(),
          emittedAt: new Date(),
        },
        select: { id: true },
      });
      await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: refonte.id,
          type: "devis",
          status: "accepte",
          number: "DEV-2099-201",
          issuedAt: new Date(),
          emittedAt: new Date(),
        },
        select: { id: true },
      });
      const draft = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: refonte.id,
          type: "facture",
          status: "brouillon",
          // number: null — jamais émis, pas de numéro légal.
        },
        select: { id: true },
      });
      draftAId = draft.id;

      // ---- Fixtures de B (pièges d'isolation : mêmes termes que A) --------
      const acmeB = await prisma.client.create({
        data: { userId: userB.id, name: "Acme Concurrent" },
        select: { id: true },
      });
      const projectB = await prisma.project.create({
        data: {
          userId: userB.id,
          clientId: acmeB.id,
          name: "Acme mission secrète B",
        },
        select: { id: true },
      });
      const docB = await prisma.document.create({
        data: {
          userId: userB.id,
          projectId: projectB.id,
          type: "facture",
          status: "envoye",
          number: "FAC-2099-102",
          issuedAt: new Date(),
          emittedAt: new Date(),
        },
        select: { id: true },
      });
      docB102Id = docB.id;
    }, TIMEOUT);

    afterAll(async () => {
      // Nettoyage — toujours exécuté, même après un échec. Ordre imposé par
      // les contraintes RESTRICT (documents -> projets -> clients -> user).
      for (const u of [userA, userB]) {
        try {
          if (u?.id) {
            await prisma.document.deleteMany({ where: { userId: u.id } });
            await prisma.project.deleteMany({ where: { userId: u.id } });
            await prisma.client.deleteMany({ where: { userId: u.id } });
          }
        } catch (e) {
          console.warn(`Nettoyage données (${u?.email}) échoué :`, e);
        }
      }
      await prisma.$disconnect();
      for (const u of [userA, userB]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression utilisateur (${u?.email}) échouée :`, e);
        }
      }
    });

    // ------------------------------------------------------------------------
    // 1. Match par famille
    // ------------------------------------------------------------------------
    describe("match par famille", () => {
      test(
        "« acme » pour A : client Acme Studio (pas Bureau Nord), projet Refonte (clientName = Acme Studio), documents vides",
        async () => {
          activeUserId = userA.id;
          const res = await searchAll("acme");

          // Clients : EXACTEMENT Acme Studio — ni Bureau Nord (ne matche pas),
          // ni Acme Concurrent (appartient à B, cf. tests d'isolation).
          expect(res.clients.map((c) => c.name)).toEqual(["Acme Studio"]);

          // Projets : EXACTEMENT Refonte Acme site, avec le nom du client
          // dénormalisé pour l'affichage « Projet · Acme Studio ».
          expect(
            res.projects.map((p) => ({ name: p.name, clientName: p.clientName })),
          ).toEqual([{ name: "Refonte Acme site", clientName: "Acme Studio" }]);

          // Documents : la recherche documents porte sur le NUMÉRO uniquement —
          // « acme » n'apparaît dans aucun numéro.
          expect(res.documents).toEqual([]);
        },
        TIMEOUT,
      );

      test(
        "« FAC-2099 » pour A : FAC-2099-101 (type facture + clientName), PAS le brouillon, PAS FAC-2099-102 (à B)",
        async () => {
          activeUserId = userA.id;
          const res = await searchAll("FAC-2099");

          expect(
            res.documents.map((d) => ({
              number: d.number,
              type: d.type,
              clientName: d.clientName,
            })),
          ).toEqual([
            {
              number: "FAC-2099-101",
              type: "facture",
              clientName: "Acme Studio",
            },
          ]);

          // Assertions négatives EXPLICITES sur les ids : le brouillon de A
          // (sans numéro) et le document de B ne figurent jamais dans la liste.
          const ids = res.documents.map((d) => d.id);
          expect(ids).not.toContain(draftAId);
          expect(ids).not.toContain(docB102Id);
        },
        TIMEOUT,
      );

      test(
        "« DEV-2099 » pour A : le devis remonte avec type « devis »",
        async () => {
          activeUserId = userA.id;
          const res = await searchAll("DEV-2099");
          expect(res.documents.map((d) => ({ number: d.number, type: d.type }))).toEqual([
            { number: "DEV-2099-201", type: "devis" },
          ]);
        },
        TIMEOUT,
      );
    });

    // ------------------------------------------------------------------------
    // 2. Isolation A / B (critique — Prisma bypasse la RLS)
    // ------------------------------------------------------------------------
    describe("isolation entre utilisateurs", () => {
      test(
        "A cherche « acme » : « Acme Concurrent » (client de B) et le projet de B n'apparaissent JAMAIS",
        async () => {
          activeUserId = userA.id;
          const res = await searchAll("acme");

          expect(res.clients.map((c) => c.name)).not.toContain("Acme Concurrent");
          expect(res.projects.map((p) => p.name)).not.toContain(
            "Acme mission secrète B",
          );
          // Redondance volontaire (anti-régression forte) : les listes de A
          // sont EXACTEMENT de taille 1 — si le filtre userId sautait, les
          // données de B les feraient grossir et ce test virerait au rouge.
          expect(res.clients).toHaveLength(1);
          expect(res.projects).toHaveLength(1);
        },
        TIMEOUT,
      );

      test(
        "A cherche « FAC-2099-102 » (numéro EXACT d'un document de B) : tout vide",
        async () => {
          // Sanity : la cible existe bien en base, chez B.
          const target = await prisma.document.findUnique({
            where: { id: docB102Id },
            select: { number: true, userId: true },
          });
          expect(target).toEqual({ number: "FAC-2099-102", userId: userB.id });

          activeUserId = userA.id;
          expect(await searchAll("FAC-2099-102")).toEqual(EMPTY);
        },
        TIMEOUT,
      );

      test(
        "B cherche « Acme Studio » (nom EXACT d'un client de A) : tout vide",
        async () => {
          activeUserId = userB.id;
          expect(await searchAll("Acme Studio")).toEqual(EMPTY);
        },
        TIMEOUT,
      );

      test(
        "sanity B : « acme » chez B renvoie bien SES données (le vide précédent n'est pas un faux positif)",
        async () => {
          // Si searchAll renvoyait vide pour une autre raison (bug de requête),
          // les deux tests précédents passeraient à tort. On prouve ici que B
          // trouve bien SES propres données avec le même terme.
          activeUserId = userB.id;
          const res = await searchAll("acme");
          expect(res.clients.map((c) => c.name)).toEqual(["Acme Concurrent"]);
          expect(res.projects.map((p) => p.name)).toEqual([
            "Acme mission secrète B",
          ]);
        },
        TIMEOUT,
      );
    });

    // ------------------------------------------------------------------------
    // 3. Insensibilité à la casse
    // ------------------------------------------------------------------------
    describe("insensibilité à la casse", () => {
      test(
        "« ACME » et « acme » renvoient les MÊMES résultats",
        async () => {
          activeUserId = userA.id;
          const upper = await searchAll("ACME");
          const lower = await searchAll("acme");
          expect(upper).toEqual(lower);
          expect(upper.clients.map((c) => c.name)).toEqual(["Acme Studio"]);
        },
        TIMEOUT,
      );

      test(
        "« fac-2099-101 » (minuscules) trouve FAC-2099-101",
        async () => {
          activeUserId = userA.id;
          const res = await searchAll("fac-2099-101");
          expect(res.documents.map((d) => d.number)).toEqual(["FAC-2099-101"]);
        },
        TIMEOUT,
      );
    });

    // ------------------------------------------------------------------------
    // 4. Garde-fous d'entrée (zod : trim, min 2, max 80)
    // ------------------------------------------------------------------------
    describe("garde-fous d'entrée", () => {
      test(
        "chaîne vide, 1 caractère, espaces autour d'1 caractère → résultats vides (pas d'exception)",
        async () => {
          activeUserId = userA.id;
          expect(await searchAll("")).toEqual(EMPTY);
          expect(await searchAll("a")).toEqual(EMPTY);
          expect(await searchAll("  a  ")).toEqual(EMPTY); // trim → 1 caractère
        },
        TIMEOUT,
      );

      test(
        "81 caractères → résultats vides (protection anti-scan large)",
        async () => {
          activeUserId = userA.id;
          expect(await searchAll("x".repeat(81))).toEqual(EMPTY);
        },
        TIMEOUT,
      );

      test(
        "«  acme  » (espaces autour d'une requête valide) → trimé, mêmes résultats que « acme »",
        async () => {
          activeUserId = userA.id;
          const trimmed = await searchAll("  acme  ");
          expect(trimmed).toEqual(await searchAll("acme"));
          expect(trimmed.clients.map((c) => c.name)).toEqual(["Acme Studio"]);
        },
        TIMEOUT,
      );
    });

    // ------------------------------------------------------------------------
    // 5. Limite take: 5 par famille
    // ------------------------------------------------------------------------
    describe("limite de résultats", () => {
      test(
        "7 clients qui matchent → EXACTEMENT 5 renvoyés",
        async () => {
          activeUserId = userA.id;
          // 7 clients de A partageant le préfixe « Lot test » (aucun autre nom
          // de fixture ne le contient : pas d'interférence avec « acme »).
          for (let i = 1; i <= 7; i++) {
            await prisma.client.create({
              data: { userId: userA.id, name: `Lot test ${i}` },
              select: { id: true },
            });
          }

          const res = await searchAll("Lot test");
          expect(res.clients).toHaveLength(5);
          for (const c of res.clients) {
            expect(c.name).toStartWith("Lot test");
          }
        },
        TIMEOUT,
      );
    });
  });
}
