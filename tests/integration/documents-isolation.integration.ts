// -----------------------------------------------------------------------------
// Isolation & appartenance des server actions Documents (#7 / #8) — issue #31.
//
// Le QUOTA du paywall d'`emitDocument` est déjà couvert par
// tests/integration/paywall-quota.integration.ts : on NE le refait PAS ici. Ce
// fichier couvre le reste du CRUD documents sous l'angle SÉCURITÉ, avec DEUX
// utilisateurs réels :
//   - lectures filtrées (getDocument / listDocuments ne fuient jamais B vers A) ;
//   - transition de statut refusée sur le document d'autrui, sans effet de bord ;
//   - saveDraft / emitDocument refusent un projectId d'un autre utilisateur
//     (appartenance transitive vérifiée AVANT écriture) ;
//   - validation zod d'emitDocument (au moins une ligne, type autorisé).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright : ces actions sont
// de simples fonctions serveur (Prisma + zod), leur seule dépendance au
// contexte HTTP est `requireUserId()` et `revalidatePath()`. On les appelle ICI
// directement en remplaçant SEULEMENT ces deux fonctions par des mocks
// (mock.module AVANT tout import dynamique — sinon l'import serait hoisté avant
// le mock et capterait la vraie session). Aucun mock du code testé lui-même :
// vraie auth Supabase, vraie base Prisma. Même pattern que
// tests/integration/paywall-quota.integration.ts.
//
// EXTENSION : `.integration.ts`, pas `.test.ts` (voir bunfig.toml) — non
// découvert par `bun test`. Lancé via `bun run test:integration`. Secrets lus
// depuis .env.local ; absents => suite SKIPPÉE proprement. Toute donnée créée
// est nettoyée en afterAll, même après un échec.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DocumentInput,
  DocumentListItem,
  EmitResult,
  UpdateStatusResult,
} from "@/app/(app)/documents/actions";

const TIMEOUT = 30_000; // émission réelle (transaction) + écritures réseau

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
  describe.skip("Documents — isolation & appartenance (#31)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));

  // Import DYNAMIQUE (après les mocks).
  const {
    getDocument,
    listDocuments,
    updateDocumentStatus,
    saveDraft,
    emitDocument,
  } = await import("@/app/(app)/documents/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-docs-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-docs-${slug}-${RUN_ID}@freelanceflow.test`;
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

  async function createClientAndProject(userId: string, label: string) {
    const client = await prisma.client.create({
      data: { userId, name: `Client docs ${label} ${RUN_ID}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet docs ${label} ${RUN_ID}` },
      select: { id: true },
    });
    return { clientId: client.id, projectId: project.id };
  }

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

  function expectEmitSuccess(
    result: EmitResult,
  ): asserts result is { id: string; number: string } {
    if ("error" in result) {
      throw new Error(
        `Émission refusée alors qu'elle devait réussir : ${result.error}`,
      );
    }
  }

  describe("Documents — isolation & appartenance (#31)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let projA: { clientId: string; projectId: string };
    let projB: { clientId: string; projectId: string };
    // Documents ÉMIS par B (fixtures d'isolation).
    let docBFactureId = "";
    let docBFactureNumber = "";
    let docBDevisId = "";
    // Document émis par A (pour prouver que listDocuments ne renvoie QUE A).
    let docAFactureNumber = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((resolve) => setTimeout(resolve, 500));

      projA = await createClientAndProject(userA.id, "A");
      projB = await createClientAndProject(userB.id, "B");

      // B émet une facture + un devis réels.
      activeUserId = userB.id;
      const bFacture = await emitDocument(emitInput(projB.projectId, "facture"));
      expectEmitSuccess(bFacture);
      docBFactureId = bFacture.id;
      docBFactureNumber = bFacture.number;

      const bDevis = await emitDocument(emitInput(projB.projectId, "devis"));
      expectEmitSuccess(bDevis);
      docBDevisId = bDevis.id;

      // A émet une facture réelle.
      activeUserId = userA.id;
      const aFacture = await emitDocument(emitInput(projA.projectId, "facture"));
      expectEmitSuccess(aFacture);
      docAFactureNumber = aFacture.number;
    }, TIMEOUT);

    afterAll(async () => {
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

    // ----------------------------------------------------------------------
    // Lectures : getDocument / listDocuments
    // ----------------------------------------------------------------------
    describe("lectures filtrées (where: { userId })", () => {
      test("getDocument(<doc de B>) « comme A » -> null (jamais la donnée de B)", async () => {
        activeUserId = userA.id;
        expect(await getDocument(docBFactureId)).toBeNull();
        expect(await getDocument(docBDevisId)).toBeNull();
      });

      test("getDocument(<doc de B>) « comme B » -> la vue (sanity : la donnée existe)", async () => {
        activeUserId = userB.id;
        const doc = await getDocument(docBFactureId);
        expect(doc).not.toBeNull();
        expect(doc!.id).toBe(docBFactureId);
        expect(doc!.number).toBe(docBFactureNumber);
      });

      test("getDocument(id non-UUID) -> null proprement", async () => {
        activeUserId = userA.id;
        expect(await getDocument("pas-un-uuid")).toBeNull();
      });

      test("listDocuments('facture') « comme A » ne contient QUE les factures de A", async () => {
        activeUserId = userA.id;
        // listDocuments renvoie désormais { items, pagination } (pagination #70).
        const { items: list } = await listDocuments("facture");
        expect(list.length).toBeGreaterThanOrEqual(1);
        // Isolation prouvée par l'id : la facture de B n'apparaît jamais.
        // (Le NUMÉRO ne prouve rien ici : la numérotation est par utilisateur,
        // A et B ont tous deux FAC-AAAA-001 — collision attendue, pas une fuite.)
        expect(list.some((d) => d.id === docBFactureId)).toBe(false);
        expect(list.some((d) => d.number === docAFactureNumber)).toBe(true);
        // Toute la liste appartient bien à A (aucun id de B).
        expect(list.every((d) => d.id !== docBFactureId)).toBe(true);
      });

      test("listDocuments('devis') « comme A » ne contient jamais le devis de B", async () => {
        activeUserId = userA.id;
        const { items: list } = await listDocuments("devis");
        expect(list.some((d) => d.id === docBDevisId)).toBe(false);
      });
    });

    // ----------------------------------------------------------------------
    // updateDocumentStatus : refus sur le document d'autrui, sans effet de bord
    // ----------------------------------------------------------------------
    describe("updateDocumentStatus — isolation", () => {
      test(
        "updateDocumentStatus(<facture de B>, 'paye') « comme A » -> { error }, document de B INCHANGÉ",
        async () => {
          activeUserId = userA.id;
          const result: UpdateStatusResult = await updateDocumentStatus(
            docBFactureId,
            "paye",
          );
          expect(result).toEqual({ error: "Document introuvable." });

          // On relit la ligne de B DIRECTEMENT en base : rien n'a bougé.
          const bDoc = await prisma.document.findUnique({
            where: { id: docBFactureId },
            select: { status: true, paidAt: true },
          });
          expect(bDoc?.status).toBe("envoye");
          expect(bDoc?.paidAt).toBeNull();
        },
        TIMEOUT,
      );

      test("updateDocumentStatus(id non-UUID, 'paye') -> { error: Document introuvable. }", async () => {
        activeUserId = userA.id;
        const result = await updateDocumentStatus("pas-un-uuid", "paye");
        expect(result).toEqual({ error: "Document introuvable." });
      });

      test(
        "sanity : B PEUT marquer sa propre facture payée (la donnée est bien mutable pour son propriétaire)",
        async () => {
          activeUserId = userB.id;
          const result = await updateDocumentStatus(docBFactureId, "paye");
          expect(result).toEqual({ ok: true });
          const bDoc = await prisma.document.findUnique({
            where: { id: docBFactureId },
            select: { status: true, paidAt: true },
          });
          expect(bDoc?.status).toBe("paye");
          expect(bDoc?.paidAt).not.toBeNull();
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // saveDraft / emitDocument : appartenance transitive du projectId
    // ----------------------------------------------------------------------
    describe("saveDraft / emitDocument — appartenance transitive du projectId", () => {
      test(
        "saveDraft({ projectId: <projet de B> }) « comme A » -> refusé, aucun document créé",
        async () => {
          activeUserId = userA.id;
          const before = await prisma.document.count({ where: { userId: userA.id } });

          const result = await saveDraft({
            type: "facture",
            projectId: projB.projectId, // projet de B
            lines: [
              { label: "Ligne", quantity: 1, unitPriceCents: 5_000, tvaRate: 20 },
            ],
          });
          expect(result).toEqual({ error: "Projet introuvable." });

          const after = await prisma.document.count({ where: { userId: userA.id } });
          expect(after).toBe(before);
          // Rien n'a été créé sous B non plus par A.
          const bCount = await prisma.document.count({
            where: { userId: userB.id, projectId: projB.projectId },
          });
          // B possède ses 2 documents émis (facture + devis), pas un de plus.
          expect(bCount).toBe(2);
        },
        TIMEOUT,
      );

      test(
        "emitDocument({ projectId: <projet de B> }) « comme A » -> refusé, aucun document créé",
        async () => {
          activeUserId = userA.id;
          const before = await prisma.document.count({ where: { userId: userA.id } });

          const result = await emitDocument(emitInput(projB.projectId, "facture"));
          expect(result).toEqual({ error: "Projet introuvable." });

          const after = await prisma.document.count({ where: { userId: userA.id } });
          expect(after).toBe(before);
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // emitDocument — validation zod (au moins une ligne, type autorisé)
    // ----------------------------------------------------------------------
    describe("emitDocument — validation zod", () => {
      test("émission sans aucune ligne -> refus, aucun document créé", async () => {
        activeUserId = userA.id;
        const before = await prisma.document.count({ where: { userId: userA.id } });
        const result = await emitDocument({
          type: "facture",
          projectId: projA.projectId,
          lines: [],
        });
        expect(result).toEqual({
          error: "Ajoutez au moins une ligne pour émettre le document.",
        });
        const after = await prisma.document.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test("type de document invalide -> refus", async () => {
        activeUserId = userA.id;
        const result = await emitDocument({
          // Cast volontaire : zod doit rejeter même une valeur mal typée
          // (ex. issue d'un JSON.parse non contrôlé).
          type: "avoir" as unknown as "facture",
          projectId: projA.projectId,
          lines: [
            { label: "Ligne", quantity: 1, unitPriceCents: 5_000, tvaRate: 20 },
          ],
        });
        expect(result).toEqual({ error: "Type de document invalide." });
      });

      test("taux de TVA non autorisé -> refus", async () => {
        activeUserId = userA.id;
        const result = await emitDocument({
          type: "facture",
          projectId: projA.projectId,
          lines: [
            { label: "Ligne", quantity: 1, unitPriceCents: 5_000, tvaRate: 17 },
          ],
        });
        expect(result).toEqual({ error: "Taux de TVA non autorisé." });
      });
    });
  });
}
