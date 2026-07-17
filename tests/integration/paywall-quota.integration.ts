// -----------------------------------------------------------------------------
// Garde de sécurité du paywall freemium — quota de 5 documents ÉMIS / mois
// calendaire sur le forfait Gratuit (issue #10).
//
// C'est le cœur métier de l'issue : `emitDocument()` (app/(app)/documents/
// actions.ts) doit refuser la 6e émission du mois pour un utilisateur `free`,
// SANS consommer de numéro ni écrire en base, tandis que `getUsage()`
// (app/(app)/abonnement/actions.ts) doit rester cohérent à chaque étape. Le
// passage en Premium (#82, paiement Stripe réel) n'est PAS testable ici — il
// n'existe plus de fonction serveur qui l'accorde sans paiement (l'ancienne
// `upgradeToPremium()`, une server action reachable sans vérification, a été
// SUPPRIMÉE pour cette raison précise, cf. lib/premium.ts) : on flippe le
// plan par écriture Prisma DIRECTE, hors de toute action, pour isoler le test
// de la logique de quota de celle du paiement. Deux utilisateurs réels
// prouvent l'isolation du compteur (where: { userId }).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright (tests/e2e/) :
// `emitDocument`/`getUsage` sont de simples fonctions
// serveur (Prisma + logique métier) — leur seule dépendance au contexte HTTP
// est `requireUserId()` (lit le cookie de session via Supabase) et
// `revalidatePath()` (cache Next). On les appelle ICI directement, en
// remplaçant seulement ces deux fonctions par des mocks (bun:test
// `mock.module`, AVANT tout import dynamique des modules d'actions — un
// import statique serait hoisté par le moteur JS avant le mock et
// appellerait la vraie session). Cela évite un aller-retour navigateur +
// build complet (~2 min) pour tester une logique qui ne touche jamais le DOM :
// plus rapide, tout aussi honnête (vraie authentification Supabase réelle,
// vraie base Prisma réelle, aucun mock du code testé lui-même).
//
// EXTENSION : `.integration.ts`, pas `.test.ts` — `bun test` sans argument ne
// découvre donc jamais ce fichier automatiquement (~25s, écritures réseau
// réelles à chaque run : pas ce qu'on veut dans la boucle rapide par défaut).
// Lancé explicitement via `bun run test:integration` (voir bunfig.toml).
//
// ENV : `bun test` (contrairement à `bun run`/`bunx`) NE charge PAS
// automatiquement .env.local — on le lit nous-mêmes ci-dessous (best-effort,
// sans jamais écraser une variable déjà présente dans l'environnement réel,
// ex. secrets CI). Si les secrets restent absents (CI `tests-unitaires`,
// cf. .github/workflows/ci.yml : ce job n'en injecte aucun), la suite est
// SKIPPÉE proprement — jamais un faux vert silencieux. Projet Supabase =
// celui de .env.local (dev, faute de projet de TEST dédié tant que #17 n'a
// pas séparé dev/prod — jamais la prod réelle). Tous les utilisateurs/
// données créés sont nettoyés en afterAll, y compris si un test échoue.
//
// BORNES DE MOIS (UTC) : `currentMonthRangeUtc()` (abonnement/actions.ts) est
// une fonction privée, non exportée — on ne modifie pas la feature pour
// l'exporter (hors périmètre de cet agent). Son comportement est donc vérifié
// INDIRECTEMENT : on écrit des documents avec un `emittedAt` posé exactement
// aux 4 instants critiques (juste avant le mois, pile au début, pile à la
// dernière milliseconde, pile au mois suivant) puis on lit `getUsage()`.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentInput, EmitResult } from "@/app/(app)/documents/actions";
import type { Usage } from "@/app/(app)/abonnement/actions";

const EMIT_TIMEOUT = 30_000; // émission réelle (transaction + retries) : plus lente qu'un aller-retour JSON

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

if (!hasEnv) {
  describe.skip("Paywall — quota mensuel de documents (#10)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import des actions --------
  // `activeUserId` est mutée entre les tests pour rejouer les actions "en tant
  // que" A, B ou C — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));

  // Import DYNAMIQUE (après les mocks : un import statique serait hoisté
  // avant mock.module par le moteur JS et capterait la vraie session).
  const { emitDocument } = await import("@/app/(app)/documents/actions");
  const { getUsage } = await import("@/app/(app)/abonnement/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-quota-${RUN_ID}-Aa1!`;

  function emitInput(
    projectId: string,
    type: "devis" | "facture" = "facture",
  ): DocumentInput {
    return {
      type,
      projectId,
      lines: [
        { label: "Prestation de test", quantity: 1, unitPriceCents: 10_000, tvaRate: 20 },
      ],
    };
  }

  // Narrowing explicite : EmitResult est une union { id, number } | { error }.
  function expectEmitSuccess(
    result: EmitResult,
  ): asserts result is { id: string; number: string } {
    if ("error" in result) {
      throw new Error(
        `Émission refusée alors qu'elle devait réussir : ${result.error}`,
      );
    }
  }
  function expectEmitRejected(result: EmitResult, message: string) {
    if (!("error" in result)) {
      throw new Error(
        `Émission acceptée alors qu'elle devait être refusée (id=${result.id}, numéro=${result.number}).`,
      );
    }
    expect(result.error).toBe(message);
  }

  async function createRealUser(slug: string) {
    const email = `test-quota-${slug}-${RUN_ID}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`Création de l'utilisateur ${slug} a échoué : ${error?.message}`);
    }
    return { id: data.user.id, email };
  }

  async function createClientAndProject(userId: string, label: string) {
    const client = await prisma.client.create({
      data: { userId, name: `Client quota ${label} ${RUN_ID}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet quota ${label} ${RUN_ID}` },
      select: { id: true },
    });
    return { clientId: client.id, projectId: project.id };
  }

  // bun:test exécute les tests d'un même fichier séquentiellement, dans
  // l'ordre d'écriture (pas de parallélisation intra-fichier) : les tests
  // ci-dessous s'appuient délibérément sur cet ordre (état cumulatif du
  // quota de A au fil des tests, comme un vrai scénario utilisateur).
  describe("Paywall — quota mensuel de documents (#10)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let userC: { id: string; email: string };
    let projA: { clientId: string; projectId: string };
    let projB: { clientId: string; projectId: string };
    let projC: { clientId: string; projectId: string };

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      userC = await createRealUser("c");

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant d'y référencer un client/projet.
      await new Promise((resolve) => setTimeout(resolve, 500));

      projA = await createClientAndProject(userA.id, "A");
      projB = await createClientAndProject(userB.id, "B");
      projC = await createClientAndProject(userC.id, "C");
    }, EMIT_TIMEOUT);

    afterAll(async () => {
      // Nettoyage — toujours exécuté, même si un test a échoué en cours de
      // route. Ordre imposé par les contraintes RESTRICT du schéma.
      for (const u of [userA, userB, userC]) {
        try {
          if (u?.id) await prisma.document.deleteMany({ where: { userId: u.id } });
        } catch (e) {
          console.warn(`Nettoyage documents (${u?.email}) échoué :`, e);
        }
      }
      for (const p of [projA, projB, projC]) {
        try {
          if (p?.projectId) await prisma.project.delete({ where: { id: p.projectId } });
        } catch (e) {
          console.warn("Nettoyage projet échoué :", e);
        }
      }
      for (const p of [projA, projB, projC]) {
        try {
          if (p?.clientId) await prisma.client.delete({ where: { id: p.clientId } });
        } catch (e) {
          console.warn("Nettoyage client échoué :", e);
        }
      }
      await prisma.$disconnect();

      for (const u of [userA, userB, userC]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression utilisateur (${u?.email}) échouée :`, e);
        }
      }
    });

    test("getUsage() reflète 0 document ce mois-ci sur le forfait Gratuit avant toute émission", async () => {
      activeUserId = userA.id;
      const usage: Usage = await getUsage();
      expect(usage.planType).toBe("free");
      expect(usage.documentsThisMonth).toBe(0);
      expect(usage.documentsLimit).toBe(5);
      expect(usage.clientsCount).toBe(1);
    });

    test(
      "5 émissions réussissent avec un numéro distinct chacune ; la 6e est refusée SANS écrire en base",
      async () => {
        activeUserId = userA.id;
        const numbers = new Set<string>();

        for (let i = 0; i < 5; i++) {
          const result = await emitDocument(
            emitInput(projA.projectId, i % 2 === 0 ? "facture" : "devis"),
          );
          expectEmitSuccess(result);
          numbers.add(result.number);
        }
        expect(numbers.size).toBe(5); // 5 numéros bien distincts

        const countAfter5 = await prisma.document.count({ where: { userId: userA.id } });
        expect(countAfter5).toBe(5);

        // 6e émission du mois : refusée, message exact, aucune écriture.
        const sixth = await emitDocument(emitInput(projA.projectId));
        expectEmitRejected(
          sixth,
          "Vous avez atteint la limite de 5 documents pour ce mois-ci sur le forfait Gratuit.",
        );

        const countAfter6 = await prisma.document.count({ where: { userId: userA.id } });
        expect(countAfter6).toBe(5); // aucun document supplémentaire créé
      },
      EMIT_TIMEOUT,
    );

    test("getUsage() reflète 5 documents ce mois-ci après avoir atteint la limite", async () => {
      activeUserId = userA.id;
      const usage: Usage = await getUsage();
      expect(usage.documentsThisMonth).toBe(5);
      expect(usage.documentsLimit).toBe(5);
      expect(usage.planType).toBe("free");
    });

    test(
      "isolation : les émissions de A ne comptent pas pour B, et inversement (where: { userId })",
      async () => {
        // A est déjà à 5/5 (test précédent). B n'a encore rien émis : si le
        // compteur n'était pas filtré par userId, B verrait déjà 5 ou serait
        // bloqué — on prouve que ce n'est pas le cas.
        activeUserId = userB.id;
        const usageB: Usage = await getUsage();
        expect(usageB.documentsThisMonth).toBe(0);
        expect(usageB.documentsLimit).toBe(5);

        const bEmission = await emitDocument(emitInput(projB.projectId));
        expectEmitSuccess(bEmission);

        const countB = await prisma.document.count({ where: { userId: userB.id } });
        expect(countB).toBe(1);

        // Réciproque : l'émission de B ne doit pas avoir touché le compte de A.
        activeUserId = userA.id;
        const usageAAfter = await getUsage();
        expect(usageAAfter.documentsThisMonth).toBe(5);
        const countA = await prisma.document.count({ where: { userId: userA.id } });
        expect(countA).toBe(5);
      },
      EMIT_TIMEOUT,
    );

    test(
      "passage en Premium lève la limite : l'émission au-delà de 5 réussit, documentsLimit devient null",
      async () => {
        activeUserId = userA.id;
        // Le forfait n'est accordé QUE par le webhook Stripe (#82) — on
        // simule ici son EFFET par une écriture Prisma directe, pour tester
        // la logique de quota indépendamment du paiement.
        await prisma.user.update({
          where: { id: userA.id },
          data: { planType: "premium" },
        });

        const usageAfterUpgrade: Usage = await getUsage();
        expect(usageAfterUpgrade.planType).toBe("premium");
        expect(usageAfterUpgrade.documentsLimit).toBeNull();

        // A était bloqué à 5/5 en Gratuit : en Premium, la 6e (en réalité la
        // 7e tentative, la 6e ayant été refusée) doit maintenant réussir.
        const beyondLimit = await emitDocument(emitInput(projA.projectId));
        expectEmitSuccess(beyondLimit);

        const countAfterUpgrade = await prisma.document.count({
          where: { userId: userA.id },
        });
        expect(countAfterUpgrade).toBe(6);
      },
      EMIT_TIMEOUT,
    );

    test("les bornes du mois calendaire (UTC) sont respectées par le compteur", async () => {
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const monthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );

      // 4 documents écrits DIRECTEMENT (pas via emitDocument : on ne teste
      // pas la numérotation ici, seulement le filtre de date de getUsage()),
      // avec emittedAt posé exactement aux 4 instants critiques.
      const timestamps = [
        { label: "juste avant le mois", emittedAt: new Date(monthStart.getTime() - 1), shouldCount: false },
        { label: "pile au début du mois", emittedAt: monthStart, shouldCount: true },
        { label: "dernière ms du mois", emittedAt: new Date(monthEnd.getTime() - 1), shouldCount: true },
        { label: "pile au mois suivant", emittedAt: monthEnd, shouldCount: false },
      ];

      for (const t of timestamps) {
        await prisma.document.create({
          data: {
            userId: userC.id,
            projectId: projC.projectId,
            type: "facture",
            status: "envoye",
            number: `FAC-BOUNDARY-${RUN_ID}-${t.emittedAt.getTime()}`,
            tvaRegime: "reel",
            totalHtCents: 10_000,
            totalTvaCents: 2_000,
            totalTtcCents: 12_000,
            issuedAt: t.emittedAt,
            emittedAt: t.emittedAt,
          },
        });
      }

      activeUserId = userC.id;
      const usageC: Usage = await getUsage();
      const expectedCount = timestamps.filter((t) => t.shouldCount).length;
      expect(usageC.documentsThisMonth).toBe(expectedCount); // 2 : début du mois (inclus) + dernière ms (inclus), bornes exclues de part et d'autre
    });
  });
}
