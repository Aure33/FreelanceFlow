// -----------------------------------------------------------------------------
// Conversion devis → facture (issue #61) — convertQuoteToInvoice /
// getDraftForEditor / traçabilité getDocument / chaîne complète jusqu'à
// l'émission.
//
// Ce fichier couvre, avec DEUX utilisateurs réels :
//   - le parcours nominal : devis ACCEPTÉ -> brouillon de facture SANS numéro,
//     lignes copiées À L'IDENTIQUE en CENTIMES (comparaison exhaustive),
//     totaux/projet/objet repris, sourceQuoteId posé, quota NON consommé ;
//   - les refus : devis non accepté, double conversion (avant ET après
//     émission de la facture — les deux messages diffèrent), devis d'autrui
//     (« Devis introuvable. », même réponse qu'un id inexistant) ;
//   - getDraftForEditor : brouillon rechargé (lignes en number,
//     sourceQuoteNumber), null pour un document émis / un autre user / un id
//     inconnu ;
//   - getDocument : sourceQuote sur la facture, convertedInvoice sur le devis ;
//   - la chaîne complète : emitDocument sur le brouillon converti -> numéro
//     FAC-, statut envoye (preuve « prêt à émettre »).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright : ces actions sont
// de simples fonctions serveur (Prisma + zod), leur seule dépendance au
// contexte HTTP est `requireUserId()` et `revalidatePath()`. On les appelle ICI
// directement en remplaçant SEULEMENT ces deux fonctions par des mocks
// (mock.module AVANT tout import dynamique — sinon l'import serait hoisté avant
// le mock et capterait la vraie session). Aucun mock du code testé lui-même :
// vraie auth Supabase, vraie base Prisma. Même pattern que
// tests/integration/documents-isolation.integration.ts.
//
// EXTENSION : `.integration.ts`, pas `.test.ts` (voir bunfig.toml) — non
// découvert par `bun test`. Lancé via `bun run test:integration`. Secrets lus
// depuis .env.local ; absents => suite SKIPPÉE proprement. Toute donnée créée
// est nettoyée en afterAll, même après un échec (l'auto-référence
// sourceQuoteId est en ON DELETE SET NULL : un deleteMany global suffit).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// Fonctions PURES (aucun I/O) : servent uniquement à fabriquer des totaux de
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
  describe.skip("Conversion devis → facture (#61)", () => {
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
  const { convertQuoteToInvoice, getDraftForEditor, getDocument, emitDocument } =
    await import("@/app/(app)/documents/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-conv-${RUN_ID}-Aa1!`;

  // Lignes du devis accepté : quantités DÉCIMALES et taux VARIÉS, exprès —
  // c'est là qu'une copie approximative (re-calcul, float, réordonnancement)
  // se trahirait. Position volontairement significative (ordre d'affichage).
  const QUOTE_LINES = [
    { label: `Conception maquettes ${RUN_ID}`, quantity: 1.5, unitPriceCents: 40_000, tvaRate: 20, position: 0 },
    { label: `Hébergement annuel ${RUN_ID}`, quantity: 2, unitPriceCents: 5_555, tvaRate: 5.5, position: 1 },
    { label: `Réunion de cadrage ${RUN_ID}`, quantity: 0.25, unitPriceCents: 100_000, tvaRate: 20, position: 2 },
  ] as const;
  // Totaux EXACTEMENT comme l'app les calcule (arrondi PAR LIGNE, centimes).
  const QUOTE_TOTALS = computeTotals(
    QUOTE_LINES.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      tvaRate: l.tvaRate,
    })),
  );
  const QUOTE_NUMBER = `DEV-TEST-${RUN_ID}`;
  const QUOTE_OBJECT = `Refonte du site vitrine ${RUN_ID}`;

  async function createRealUser(slug: string) {
    const email = `test-conv-${slug}-${RUN_ID}@freelanceflow.test`;
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

  // Instantané des documents d'un user (id -> {status, number}) : sert à
  // prouver « rien n'a bougé » après une tentative refusée.
  async function snapshotDocs(userId: string) {
    const rows = await prisma.document.findMany({
      where: { userId },
      select: { id: true, status: true, number: true, sourceQuoteId: true },
      orderBy: { id: "asc" },
    });
    return JSON.stringify(rows);
  }

  describe("Conversion devis → facture (#61)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let clientAId = "";
    let projectAId = "";
    let quoteAcceptedId = ""; // devis ÉMIS et ACCEPTÉ de A (convertible)
    let quoteSentId = ""; // devis ÉMIS mais seulement ENVOYÉ de A (non convertible)
    let invoiceId = ""; // brouillon de facture issu de la conversion (test 1)
    let invoiceNumber = ""; // numéro attribué à l'émission (test « chaîne complète »)

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      // Laisse le trigger `on_auth_user_created` créer les lignes public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const client = await prisma.client.create({
        data: { userId: userA.id, name: `Client conv ${RUN_ID}` },
        select: { id: true },
      });
      clientAId = client.id;
      const project = await prisma.project.create({
        data: { userId: userA.id, clientId: client.id, name: `Projet conv ${RUN_ID}` },
        select: { id: true },
      });
      projectAId = project.id;

      // Devis ACCEPTÉ, fabriqué directement via Prisma (émis : numéro posé,
      // PAS d'emittedAt -> le quota freemium de A reste à 0/5 pour la suite).
      const accepted = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "devis",
          status: "accepte",
          number: QUOTE_NUMBER,
          object: QUOTE_OBJECT,
          tvaRegime: "reel",
          issuedAt: new Date(),
          totalHtCents: QUOTE_TOTALS.totalHtCents,
          totalTvaCents: QUOTE_TOTALS.totalTvaCents,
          totalTtcCents: QUOTE_TOTALS.totalTtcCents,
          lines: {
            create: QUOTE_LINES.map((l) => ({ userId: userA.id, ...l })),
          },
        },
        select: { id: true },
      });
      quoteAcceptedId = accepted.id;

      // Devis simplement ENVOYÉ (pas accepté) : la conversion doit le refuser.
      const sent = await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "devis",
          status: "envoye",
          number: `${QUOTE_NUMBER}-2`,
          tvaRegime: "reel",
          issuedAt: new Date(),
          totalHtCents: 10_000,
          totalTvaCents: 2_000,
          totalTtcCents: 12_000,
          lines: {
            create: [
              {
                userId: userA.id,
                label: "Prestation non tranchée",
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
      quoteSentId = sent.id;
    }, TIMEOUT);

    afterAll(async () => {
      // Ordre imposé par les contraintes : documents d'abord (les lignes
      // suivent en CASCADE ; l'auto-référence sourceQuoteId est en SET NULL,
      // un deleteMany global par user suffit), puis projets, puis clients.
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
    // 1. Parcours nominal : devis accepté -> brouillon de facture fidèle
    // ------------------------------------------------------------------------
    test(
      "devis accepté -> brouillon de facture SANS numéro, lignes copiées à l'identique (centimes)",
      async () => {
        activeUserId = userA.id;
        const result = await convertQuoteToInvoice(quoteAcceptedId);
        if ("error" in result) {
          throw new Error(`Conversion refusée à tort : ${result.error}`);
        }
        invoiceId = result.id;

        // Vérification EN BASE (pas via l'action) : la facture est bien celle
        // annoncée, brouillon, sans numéro, tracée vers le devis.
        const invoice = await prisma.document.findUnique({
          where: { id: invoiceId },
          select: {
            userId: true,
            type: true,
            status: true,
            number: true,
            emittedAt: true,
            projectId: true,
            object: true,
            totalHtCents: true,
            totalTvaCents: true,
            totalTtcCents: true,
            sourceQuoteId: true,
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
        expect(invoice).not.toBeNull();
        expect(invoice!.userId).toBe(userA.id);
        expect(invoice!.type).toBe("facture");
        expect(invoice!.status).toBe("brouillon");
        expect(invoice!.number).toBeNull(); // AUCUN numéro avant émission
        expect(invoice!.emittedAt).toBeNull(); // quota freemium NON consommé
        expect(invoice!.projectId).toBe(projectAId);
        expect(invoice!.object).toBe(QUOTE_OBJECT);
        expect(invoice!.sourceQuoteId).toBe(quoteAcceptedId);
        // Totaux copiés du devis (en centimes entiers).
        expect(invoice!.totalHtCents).toBe(QUOTE_TOTALS.totalHtCents);
        expect(invoice!.totalTvaCents).toBe(QUOTE_TOTALS.totalTvaCents);
        expect(invoice!.totalTtcCents).toBe(QUOTE_TOTALS.totalTtcCents);
        // Lignes : comparaison EXHAUSTIVE champ à champ (Decimal -> Number),
        // y compris la position (l'ordre d'affichage fait partie du document).
        expect(
          invoice!.lines.map((l) => ({
            label: l.label,
            quantity: Number(l.quantity),
            unitPriceCents: l.unitPriceCents,
            tvaRate: Number(l.tvaRate),
            position: l.position,
          })),
        ).toEqual(QUOTE_LINES.map((l) => ({ ...l })));
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 2. Statut requis : un devis seulement envoyé ne se convertit pas
    // ------------------------------------------------------------------------
    test(
      "devis « envoye » -> refus (seul un devis accepté se convertit), rien créé",
      async () => {
        activeUserId = userA.id;
        const before = await snapshotDocs(userA.id);

        const result = await convertQuoteToInvoice(quoteSentId);
        expect(result).toEqual({
          error: "Seul un devis accepté peut être converti en facture.",
        });

        expect(await snapshotDocs(userA.id)).toBe(before);
        const linked = await prisma.document.count({
          where: { sourceQuoteId: quoteSentId },
        });
        expect(linked).toBe(0);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 3. Anti-double conversion (facture encore en brouillon)
    // ------------------------------------------------------------------------
    test(
      "2e conversion du même devis -> refus (brouillon existant), toujours UNE seule facture liée",
      async () => {
        activeUserId = userA.id;
        const result = await convertQuoteToInvoice(quoteAcceptedId);
        expect(result).toEqual({
          error: "Ce devis a déjà été converti — un brouillon de facture existe.",
        });

        const linked = await prisma.document.findMany({
          where: { sourceQuoteId: quoteAcceptedId },
          select: { id: true },
        });
        expect(linked).toEqual([{ id: invoiceId }]);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 4. Isolation (critique RNCP) : le devis de A est invisible pour B
    // ------------------------------------------------------------------------
    test(
      "convertQuoteToInvoice(<devis de A>) « comme B » -> « Devis introuvable. », rien créé chez A ni B",
      async () => {
        const beforeA = await snapshotDocs(userA.id);
        const beforeB = await snapshotDocs(userB.id);

        activeUserId = userB.id;
        const result = await convertQuoteToInvoice(quoteAcceptedId);
        // Même réponse qu'un id inexistant : aucune fuite d'existence.
        expect(result).toEqual({ error: "Devis introuvable." });

        expect(await snapshotDocs(userA.id)).toBe(beforeA);
        expect(await snapshotDocs(userB.id)).toBe(beforeB);
      },
      TIMEOUT,
    );

    test("convertQuoteToInvoice(uuid inconnu) et (non-uuid) -> « Devis introuvable. »", async () => {
      activeUserId = userA.id;
      expect(await convertQuoteToInvoice(randomUUID())).toEqual({
        error: "Devis introuvable.",
      });
      expect(await convertQuoteToInvoice("pas-un-uuid")).toEqual({
        error: "Devis introuvable.",
      });
    });

    // ------------------------------------------------------------------------
    // 5. getDraftForEditor : reprise du brouillon converti dans l'éditeur
    // ------------------------------------------------------------------------
    test(
      "getDraftForEditor(<brouillon converti>) « comme A » -> lignes en number + sourceQuoteNumber",
      async () => {
        activeUserId = userA.id;
        const draft = await getDraftForEditor(invoiceId);
        expect(draft).not.toBeNull();
        expect(draft!.id).toBe(invoiceId);
        expect(draft!.type).toBe("facture");
        expect(draft!.projectId).toBe(projectAId);
        expect(draft!.object).toBe(QUOTE_OBJECT);
        expect(draft!.sourceQuoteNumber).toBe(QUOTE_NUMBER);
        // Lignes prêtes pour l'éditeur : Decimal convertis en number, ordre
        // des positions respecté.
        expect(draft!.lines).toEqual(
          QUOTE_LINES.map((l) => ({
            label: l.label,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            tvaRate: l.tvaRate,
          })),
        );
      },
      TIMEOUT,
    );

    test("getDraftForEditor(<document ÉMIS>) -> null (un numéro figé ne se recharge pas)", async () => {
      activeUserId = userA.id;
      // Le devis accepté est émis (numéro posé) : jamais rechargeable.
      expect(await getDraftForEditor(quoteAcceptedId)).toBeNull();
    });

    test("getDraftForEditor(<brouillon de A>) « comme B » -> null (isolation)", async () => {
      activeUserId = userB.id;
      expect(await getDraftForEditor(invoiceId)).toBeNull();
    });

    test("getDraftForEditor(uuid inconnu) et (non-uuid) -> null", async () => {
      activeUserId = userA.id;
      expect(await getDraftForEditor(randomUUID())).toBeNull();
      expect(await getDraftForEditor("pas-un-uuid")).toBeNull();
    });

    // ------------------------------------------------------------------------
    // 6. getDocument : traçabilité dans les deux sens
    // ------------------------------------------------------------------------
    test(
      "getDocument(<facture>) -> sourceQuote ; getDocument(<devis>) -> convertedInvoice { isDraft: true }",
      async () => {
        activeUserId = userA.id;

        const invoiceView = await getDocument(invoiceId);
        expect(invoiceView).not.toBeNull();
        expect(invoiceView!.sourceQuote).toEqual({
          id: quoteAcceptedId,
          number: QUOTE_NUMBER,
        });
        expect(invoiceView!.convertedInvoice).toBeNull();

        const quoteView = await getDocument(quoteAcceptedId);
        expect(quoteView).not.toBeNull();
        expect(quoteView!.sourceQuote).toBeNull();
        expect(quoteView!.convertedInvoice).toEqual({
          id: invoiceId,
          number: null,
          isDraft: true,
        });
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 7. Chaîne complète : le brouillon converti s'émet normalement
    // ------------------------------------------------------------------------
    test(
      "emitDocument(<brouillon converti>) -> numéro FAC- attribué, statut envoye, traçabilité conservée",
      async () => {
        activeUserId = userA.id;
        // A est plan free avec 0 émission ce mois-ci (les devis de fixture ont
        // été créés SANS emittedAt) : le quota 5/mois ne bloque pas.
        const draft = await getDraftForEditor(invoiceId);
        expect(draft).not.toBeNull();

        // Même payload que l'éditeur (buildInput) : id du brouillon + lignes.
        const result = await emitDocument({
          id: invoiceId,
          type: "facture",
          projectId: draft!.projectId,
          object: draft!.object ?? undefined,
          lines: draft!.lines,
        });
        if ("error" in result) {
          throw new Error(`Émission refusée à tort : ${result.error}`);
        }
        expect(result.id).toBe(invoiceId);
        expect(result.number).toMatch(/^FAC-\d{4}-\d{3}$/);
        invoiceNumber = result.number;

        const row = await prisma.document.findUnique({
          where: { id: invoiceId },
          select: {
            status: true,
            number: true,
            emittedAt: true,
            sourceQuoteId: true,
            totalHtCents: true,
            totalTvaCents: true,
            totalTtcCents: true,
          },
        });
        expect(row?.status).toBe("envoye");
        expect(row?.number).toBe(invoiceNumber);
        expect(row?.emittedAt).not.toBeNull(); // horodatage serveur posé (quota)
        expect(row?.sourceQuoteId).toBe(quoteAcceptedId); // traçabilité conservée
        // Totaux RECALCULÉS à l'émission sur les mêmes lignes : identiques.
        expect(row?.totalHtCents).toBe(QUOTE_TOTALS.totalHtCents);
        expect(row?.totalTvaCents).toBe(QUOTE_TOTALS.totalTvaCents);
        expect(row?.totalTtcCents).toBe(QUOTE_TOTALS.totalTtcCents);
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // 8. Anti-double conversion, variante facture ÉMISE (message avec numéro)
    // ------------------------------------------------------------------------
    test(
      "reconvertir après émission -> refus mentionnant le numéro de la facture",
      async () => {
        activeUserId = userA.id;
        const result = await convertQuoteToInvoice(quoteAcceptedId);
        expect(result).toEqual({
          error: `Ce devis a déjà été converti (facture ${invoiceNumber}).`,
        });
        const linked = await prisma.document.count({
          where: { sourceQuoteId: quoteAcceptedId },
        });
        expect(linked).toBe(1);
      },
      TIMEOUT,
    );
  });
}
