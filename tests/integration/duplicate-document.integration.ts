// -----------------------------------------------------------------------------
// Duplication de document (issue #66) — duplicateDocument.
//
// Ce fichier couvre, avec DEUX utilisateurs réels :
//   - le parcours nominal : facture ÉMISE et PAYÉE -> nouveau BROUILLON du même
//     type, SANS numéro, SANS emittedAt (quota freemium intact), SANS
//     paidAt/dueAt, SANS sourceQuoteId (duplication ≠ conversion #61), lignes
//     copiées À L'IDENTIQUE en CENTIMES (comparaison exhaustive), original
//     STRICTEMENT inchangé (instantané avant/après, lignes comprises) ;
//   - le type est conservé : un devis se duplique en devis ;
//   - un BROUILLON se duplique aussi (tout type/statut est duplicable) ;
//   - la duplication est ILLIMITÉE : 2 duplications du même document -> 2
//     brouillons distincts (pas d'anti-double, contrairement à la conversion) ;
//   - le quota freemium : le count `emittedAt != null` du mois est inchangé
//     après duplication (assertion directe en base) ;
//   - l'ISOLATION (critique RNCP) : user B qui duplique le document de A
//     reçoit « Document introuvable. » (même réponse qu'un id inexistant —
//     aucune fuite d'existence) et RIEN n'est créé chez A ni chez B ;
//   - la chaîne complète : emitDocument sur le brouillon dupliqué -> nouveau
//     numéro DISTINCT de l'original, totaux recalculés identiques.
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright : duplicateDocument
// est une simple fonction serveur (Prisma + zod), sa seule dépendance au
// contexte HTTP est `requireUserId()` et `revalidatePath()`. On l'appelle ICI
// directement en remplaçant SEULEMENT ces deux fonctions par des mocks
// (mock.module AVANT tout import dynamique — sinon l'import serait hoisté avant
// le mock et capterait la vraie session). Aucun mock du code testé lui-même :
// vraie auth Supabase, vraie base Prisma. Même pattern que
// tests/integration/convert-quote.integration.ts.
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
// Fonction PURE (aucun I/O) : sert uniquement à fabriquer des totaux de
// fixture cohérents avec le calcul autoritatif de l'application.
import { computeTotals } from "@/lib/invoicing";

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

if (!hasEnv) {
  describe.skip("Duplication de document (#66)", () => {
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
  const { duplicateDocument, getDraftForEditor, emitDocument } = await import(
    "@/app/(app)/documents/actions"
  );

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-dup-${RUN_ID}-Aa1!`;

  // Lignes de la facture source : quantités DÉCIMALES et taux VARIÉS (20 et
  // 5,5), exprès — c'est là qu'une copie approximative (re-calcul, float,
  // réordonnancement) se trahirait. Position significative (ordre d'affichage).
  const INVOICE_LINES = [
    { label: `Développement front ${RUN_ID}`, quantity: 1.5, unitPriceCents: 40_000, tvaRate: 20, position: 0 },
    { label: `Hébergement annuel ${RUN_ID}`, quantity: 2, unitPriceCents: 5_555, tvaRate: 5.5, position: 1 },
    { label: `Réunion de cadrage ${RUN_ID}`, quantity: 0.25, unitPriceCents: 100_000, tvaRate: 20, position: 2 },
  ] as const;
  // Totaux EXACTEMENT comme l'app les calcule (arrondi PAR LIGNE, centimes).
  const INVOICE_TOTALS = computeTotals(
    INVOICE_LINES.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      tvaRate: l.tvaRate,
    })),
  );
  const INVOICE_NUMBER = `FAC-TEST-${RUN_ID}`;
  const INVOICE_OBJECT = `Maintenance mensuelle ${RUN_ID}`;

  async function createRealUser(slug: string) {
    const email = `test-dup-${slug}-${RUN_ID}@freelanceflow.test`;
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

  // Instantané des documents d'un user : sert à prouver « rien n'a bougé »
  // après une tentative refusée (isolation).
  async function snapshotDocs(userId: string) {
    const rows = await prisma.document.findMany({
      where: { userId },
      select: { id: true, status: true, number: true, emittedAt: true },
      orderBy: { id: "asc" },
    });
    return JSON.stringify(rows);
  }

  // Instantané COMPLET d'un document (lignes comprises) : prouve que la
  // duplication ne mute JAMAIS l'original.
  async function snapshotFullDocument(id: string) {
    const row = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        number: true,
        object: true,
        projectId: true,
        tvaRegime: true,
        issuedAt: true,
        dueAt: true,
        paidAt: true,
        emittedAt: true,
        sourceQuoteId: true,
        totalHtCents: true,
        totalTvaCents: true,
        totalTtcCents: true,
        lines: {
          select: {
            label: true,
            quantity: true,
            unitPriceCents: true,
            tvaRate: true,
            position: true,
          },
          orderBy: { position: "asc" },
        },
      },
    });
    return JSON.stringify(row);
  }

  // Count « emittedAt posé ce mois-ci » d'un user : le compteur EXACT du quota
  // freemium (#10) — même fenêtre UTC qu'emitDocument().
  async function emittedThisMonthCount(userId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return prisma.document.count({
      where: { userId, emittedAt: { gte: monthStart, lt: monthEnd } },
    });
  }

  describe("Duplication de document (#66)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let clientAId = "";
    let projectAId = "";
    let invoicePaidId = ""; // facture ÉMISE (numéro + emittedAt) et PAYÉE de A
    let quoteSentId = ""; // devis ÉMIS de A (type conservé à la duplication)
    let draftId = ""; // brouillon de A (un brouillon se duplique aussi)
    let dupInvoiceId = ""; // brouillon issu de la duplication (test 1)

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      // Laisse le trigger `on_auth_user_created` créer les lignes public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const client = await prisma.client.create({
        data: { userId: userA.id, name: `Client dup ${RUN_ID}` },
        select: { id: true },
      });
      clientAId = client.id;
      const project = await prisma.project.create({
        data: { userId: userA.id, clientId: client.id, name: `Projet dup ${RUN_ID}` },
        select: { id: true },
      });
      projectAId = project.id;

      // Facture ÉMISE et PAYÉE, fabriquée directement via Prisma : numéro,
      // emittedAt (elle compte 1 dans le quota du mois — le test « quota »
      // prouve que la duplication n'y ajoute rien), dueAt et paidAt posés —
      // TOUT ce que la copie doit précisément NE PAS reprendre.
      const paid = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "paye",
          number: INVOICE_NUMBER,
          object: INVOICE_OBJECT,
          tvaRegime: "reel",
          issuedAt: new Date(),
          emittedAt: new Date(),
          dueAt: new Date(),
          paidAt: new Date(),
          totalHtCents: INVOICE_TOTALS.totalHtCents,
          totalTvaCents: INVOICE_TOTALS.totalTvaCents,
          totalTtcCents: INVOICE_TOTALS.totalTtcCents,
          lines: {
            create: INVOICE_LINES.map((l) => ({ userId: userA.id, ...l })),
          },
        },
        select: { id: true },
      });
      invoicePaidId = paid.id;

      // Devis ÉMIS : prouve que la duplication CONSERVE le type (devis->devis)
      // et ne pose pas de sourceQuoteId (ce n'est PAS une conversion #61).
      const quote = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "devis",
          status: "envoye",
          number: `DEV-TEST-${RUN_ID}`,
          object: `Chiffrage refonte ${RUN_ID}`,
          tvaRegime: "reel",
          issuedAt: new Date(),
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          lines: {
            create: [
              {
                userId: userA.id,
                label: `Audit préalable ${RUN_ID}`,
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
      quoteSentId = quote.id;

      // Brouillon (jamais émis) : tout statut est duplicable, brouillon compris.
      const draft = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "brouillon",
          object: `Brouillon en cours ${RUN_ID}`,
          issuedAt: new Date(),
          totalHtCents: 5_000,
          totalTvaCents: 1_000,
          totalTtcCents: 6_000,
          lines: {
            create: [
              {
                userId: userA.id,
                label: `Prestation en préparation ${RUN_ID}`,
                quantity: 1,
                unitPriceCents: 5_000,
                tvaRate: 20,
                position: 0,
              },
            ],
          },
        },
        select: { id: true },
      });
      draftId = draft.id;
    }, TIMEOUT);

    afterAll(async () => {
      // Ordre imposé par les contraintes : documents d'abord (les lignes
      // suivent en CASCADE), puis projets, puis clients.
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
    // 1. Nominal : facture émise/payée -> brouillon fidèle, original intact
    // ------------------------------------------------------------------------
    test(
      "facture émise/payée -> brouillon SANS numéro/emittedAt/dueAt/paidAt, lignes copiées à l'identique (centimes), original inchangé",
      async () => {
        activeUserId = userA.id;
        const originalBefore = await snapshotFullDocument(invoicePaidId);

        const result = await duplicateDocument(invoicePaidId);
        if ("error" in result) {
          throw new Error(`Duplication refusée à tort : ${result.error}`);
        }
        dupInvoiceId = result.id;
        // Nouveau document DISTINCT (jamais l'original renvoyé tel quel).
        expect(dupInvoiceId).not.toBe(invoicePaidId);

        // Vérification EN BASE (pas via l'action) : la copie est bien celle
        // annoncée — même type, brouillon vierge de toute vie « émise ».
        const dup = await prisma.document.findUnique({
          where: { id: dupInvoiceId },
          select: {
            userId: true,
            type: true,
            status: true,
            number: true,
            emittedAt: true,
            dueAt: true,
            paidAt: true,
            sourceQuoteId: true,
            projectId: true,
            object: true,
            totalHtCents: true,
            totalTvaCents: true,
            totalTtcCents: true,
            lines: {
              select: {
                label: true,
                quantity: true,
                unitPriceCents: true,
                tvaRate: true,
                position: true,
              },
              orderBy: { position: "asc" },
            },
          },
        });
        expect(dup).not.toBeNull();
        expect(dup!.userId).toBe(userA.id);
        expect(dup!.type).toBe("facture"); // même type que la source
        expect(dup!.status).toBe("brouillon");
        expect(dup!.number).toBeNull(); // AUCUN numéro avant émission
        expect(dup!.emittedAt).toBeNull(); // quota freemium NON consommé
        expect(dup!.dueAt).toBeNull(); // pas d'échéance héritée
        expect(dup!.paidAt).toBeNull(); // pas de paiement hérité
        expect(dup!.sourceQuoteId).toBeNull(); // duplication ≠ conversion (#61)
        expect(dup!.projectId).toBe(projectAId);
        expect(dup!.object).toBe(INVOICE_OBJECT);
        // Totaux copiés de la source (en centimes entiers).
        expect(dup!.totalHtCents).toBe(INVOICE_TOTALS.totalHtCents);
        expect(dup!.totalTvaCents).toBe(INVOICE_TOTALS.totalTvaCents);
        expect(dup!.totalTtcCents).toBe(INVOICE_TOTALS.totalTtcCents);
        // Lignes : comparaison EXHAUSTIVE champ à champ (Decimal -> Number),
        // y compris la position (l'ordre d'affichage fait partie du document).
        expect(
          dup!.lines.map((l) => ({
            label: l.label,
            quantity: Number(l.quantity),
            unitPriceCents: l.unitPriceCents,
            tvaRate: Number(l.tvaRate),
            position: l.position,
          })),
        ).toEqual(INVOICE_LINES.map((l) => ({ ...l })));

        // L'ORIGINAL est STRICTEMENT inchangé (statut, numéro, dates, lignes).
        expect(await snapshotFullDocument(invoicePaidId)).toBe(originalBefore);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 2. Type conservé : un devis se duplique en devis
    // ------------------------------------------------------------------------
    test(
      "devis -> le brouillon dupliqué est un DEVIS (type conservé), sans numéro ni sourceQuoteId",
      async () => {
        activeUserId = userA.id;
        const result = await duplicateDocument(quoteSentId);
        if ("error" in result) {
          throw new Error(`Duplication du devis refusée à tort : ${result.error}`);
        }
        expect(result.id).not.toBe(quoteSentId);

        const dup = await prisma.document.findUnique({
          where: { id: result.id },
          select: {
            type: true,
            status: true,
            number: true,
            emittedAt: true,
            sourceQuoteId: true,
            totalTtcCents: true,
          },
        });
        expect(dup).not.toBeNull();
        expect(dup!.type).toBe("devis"); // PAS une facture : type conservé
        expect(dup!.status).toBe("brouillon");
        expect(dup!.number).toBeNull();
        expect(dup!.emittedAt).toBeNull();
        expect(dup!.sourceQuoteId).toBeNull();
        expect(dup!.totalTtcCents).toBe(12_000);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 3. Un brouillon se duplique aussi (tout statut est duplicable)
    // ------------------------------------------------------------------------
    test(
      "brouillon -> se duplique en un SECOND brouillon distinct (lignes copiées)",
      async () => {
        activeUserId = userA.id;
        const result = await duplicateDocument(draftId);
        if ("error" in result) {
          throw new Error(`Duplication du brouillon refusée à tort : ${result.error}`);
        }
        expect(result.id).not.toBe(draftId);

        const dup = await prisma.document.findUnique({
          where: { id: result.id },
          select: {
            type: true,
            status: true,
            number: true,
            object: true,
            lines: { select: { label: true } },
          },
        });
        expect(dup).not.toBeNull();
        expect(dup!.type).toBe("facture");
        expect(dup!.status).toBe("brouillon");
        expect(dup!.number).toBeNull();
        expect(dup!.object).toBe(`Brouillon en cours ${RUN_ID}`);
        expect(dup!.lines).toEqual([
          { label: `Prestation en préparation ${RUN_ID}` },
        ]);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 4. Duplication ILLIMITÉE : pas d'anti-double (≠ conversion #61)
    // ------------------------------------------------------------------------
    test(
      "2 duplications successives du même document -> 2 brouillons DISTINCTS (aucun anti-double)",
      async () => {
        activeUserId = userA.id;
        const first = await duplicateDocument(quoteSentId);
        const second = await duplicateDocument(quoteSentId);
        if ("error" in first || "error" in second) {
          throw new Error("Une duplication répétée a été refusée à tort.");
        }
        expect(first.id).not.toBe(second.id);

        // Les deux copies existent réellement en base, chacune en brouillon.
        const copies = await prisma.document.findMany({
          where: { id: { in: [first.id, second.id] } },
          select: { id: true, status: true, number: true },
        });
        expect(copies).toHaveLength(2);
        for (const c of copies) {
          expect(c.status).toBe("brouillon");
          expect(c.number).toBeNull();
        }
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 5. Quota freemium : la duplication ne pose JAMAIS d'emittedAt
    // ------------------------------------------------------------------------
    test(
      "le count `emittedAt != null` du mois est INCHANGÉ après duplication (quota #10 intact)",
      async () => {
        activeUserId = userA.id;
        // La facture de fixture a un emittedAt ce mois-ci : le compteur vaut
        // au moins 1 — si la duplication COPIAIT emittedAt, il augmenterait.
        const before = await emittedThisMonthCount(userA.id);
        expect(before).toBeGreaterThanOrEqual(1);

        const result = await duplicateDocument(invoicePaidId);
        if ("error" in result) {
          throw new Error(`Duplication refusée à tort : ${result.error}`);
        }

        expect(await emittedThisMonthCount(userA.id)).toBe(before);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 6. Isolation (critique RNCP) : le document de A est invisible pour B
    // ------------------------------------------------------------------------
    test(
      "duplicateDocument(<document de A>) « comme B » -> « Document introuvable. », rien créé chez A ni B",
      async () => {
        const beforeA = await snapshotDocs(userA.id);
        const beforeB = await snapshotDocs(userB.id);

        activeUserId = userB.id;
        const result = await duplicateDocument(invoicePaidId);
        // Même réponse qu'un id inexistant : aucune fuite d'existence.
        expect(result).toEqual({ error: "Document introuvable." });

        expect(await snapshotDocs(userA.id)).toBe(beforeA);
        expect(await snapshotDocs(userB.id)).toBe(beforeB);
      },
      TIMEOUT,
    );

    test("duplicateDocument(uuid inconnu) et (non-uuid) -> « Document introuvable. »", async () => {
      activeUserId = userA.id;
      expect(await duplicateDocument(randomUUID())).toEqual({
        error: "Document introuvable.",
      });
      expect(await duplicateDocument("pas-un-uuid")).toEqual({
        error: "Document introuvable.",
      });
    });

    // ------------------------------------------------------------------------
    // 7. Chaîne complète : le brouillon dupliqué s'émet normalement
    // ------------------------------------------------------------------------
    test(
      "emitDocument(<brouillon dupliqué>) -> NOUVEAU numéro distinct de l'original, totaux recalculés identiques",
      async () => {
        activeUserId = userA.id;
        // Le brouillon dupliqué se recharge dans l'éditeur (infra #61) : même
        // payload que l'UI (id + lignes rechargées) pour l'émission.
        const draft = await getDraftForEditor(dupInvoiceId);
        expect(draft).not.toBeNull();

        const result = await emitDocument({
          id: dupInvoiceId,
          type: "facture",
          projectId: draft!.projectId,
          object: draft!.object ?? undefined,
          lines: draft!.lines,
        });
        if ("error" in result) {
          throw new Error(`Émission refusée à tort : ${result.error}`);
        }
        expect(result.id).toBe(dupInvoiceId);
        expect(result.number).toMatch(/^FAC-\d{4}-\d{3}$/);
        expect(result.number).not.toBe(INVOICE_NUMBER); // jamais le numéro de l'original

        const row = await prisma.document.findUnique({
          where: { id: dupInvoiceId },
          select: {
            status: true,
            number: true,
            emittedAt: true,
            totalHtCents: true,
            totalTvaCents: true,
            totalTtcCents: true,
          },
        });
        expect(row?.status).toBe("envoye");
        expect(row?.number).toBe(result.number);
        expect(row?.emittedAt).not.toBeNull(); // l'ÉMISSION consomme le quota, pas la duplication
        // Totaux RECALCULÉS à l'émission sur les lignes copiées : identiques à
        // ceux de l'original — la preuve finale que la copie est fidèle au
        // centime (quantités décimales + taux 20/5,5 compris).
        expect(row?.totalHtCents).toBe(INVOICE_TOTALS.totalHtCents);
        expect(row?.totalTvaCents).toBe(INVOICE_TOTALS.totalTvaCents);
        expect(row?.totalTtcCents).toBe(INVOICE_TOTALS.totalTtcCents);

        // Et l'original garde SON numéro (aucune mutation croisée).
        const original = await prisma.document.findUnique({
          where: { id: invoicePaidId },
          select: { number: true, status: true },
        });
        expect(original?.number).toBe(INVOICE_NUMBER);
        expect(original?.status).toBe("paye");
      },
      TIMEOUT,
    );
  });
}
