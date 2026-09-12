// Annulation d'un changement de statut (issue #107) — tests d'intégration de
// updateDocumentStatus() contre la vraie base (Supabase DEV).
//
// Couvre :
//   ① facture payée → « envoye » : statut remis, paidAt EFFACÉ ;
//   ② devis accepté → « envoye » (remettre en attente de réponse) ;
//   ③ devis déjà CONVERTI en facture (#61) : toute modification de décision
//     refusée, devis inchangé ;
//   ④ isolation : A ne peut pas annuler le paiement d'une facture de B.
//
// Secrets : .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DATABASE_URL) — absents ⇒ suite SKIPPÉE. Données nettoyées en afterAll.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 30_000;

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
  describe.skip("Annulation de statut (#107)", () => {
    test("secrets Supabase absents — cf. .env.local", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));

  const { updateDocumentStatus } = await import("@/app/(app)/documents/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);

  async function createRealUser(slug: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `test-undo-${slug}-${RUN_ID}@freelanceflow.test`,
      password: `Test-undo-${RUN_ID}-Aa1!`,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`createUser: ${error?.message}`);
    return data.user.id;
  }

  async function seedProject(userId: string) {
    const client = await prisma.client.create({
      data: { userId, name: `Client undo ${RUN_ID}` },
    });
    return prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet undo ${RUN_ID}` },
    });
  }

  let userA = "";
  let userB = "";
  let paidInvoiceA = "";
  let acceptedQuoteA = "";
  let convertedQuoteA = "";
  let paidInvoiceB = "";

  describe("Annulation de statut — updateDocumentStatus (#107)", () => {
    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 800)); // trigger public.users
      const projA = await seedProject(userA);
      const projB = await seedProject(userB);
      const now = new Date();
      const base = {
        issuedAt: now,
        emittedAt: now,
        dueAt: new Date(now.getTime() + 30 * 86400_000),
        totalHtCents: 10_000,
        totalTvaCents: 2_000,
        totalTtcCents: 12_000,
      };

      paidInvoiceA = (
        await prisma.document.create({
          data: {
            ...base,
            userId: userA,
            projectId: projA.id,
            type: "facture",
            number: `FAC-UNDO-${RUN_ID}-1`,
            status: "paye",
            paidAt: now,
          },
        })
      ).id;
      acceptedQuoteA = (
        await prisma.document.create({
          data: {
            ...base,
            userId: userA,
            projectId: projA.id,
            type: "devis",
            number: `DEV-UNDO-${RUN_ID}-1`,
            status: "accepte",
          },
        })
      ).id;
      convertedQuoteA = (
        await prisma.document.create({
          data: {
            ...base,
            userId: userA,
            projectId: projA.id,
            type: "devis",
            number: `DEV-UNDO-${RUN_ID}-2`,
            status: "accepte",
          },
        })
      ).id;
      // Brouillon de facture issu du devis (traçabilité #61).
      await prisma.document.create({
        data: {
          userId: userA,
          projectId: projA.id,
          type: "facture",
          status: "brouillon",
          sourceQuoteId: convertedQuoteA,
        },
      });
      paidInvoiceB = (
        await prisma.document.create({
          data: {
            ...base,
            userId: userB,
            projectId: projB.id,
            type: "facture",
            number: `FAC-UNDO-${RUN_ID}-B`,
            status: "paye",
            paidAt: now,
          },
        })
      ).id;
    }, TIMEOUT);

    afterAll(async () => {
      for (const u of [userA, userB].filter(Boolean)) {
        await prisma.document.deleteMany({
          where: { userId: u, sourceQuoteId: { not: null } },
        });
        await prisma.document.deleteMany({ where: { userId: u } });
        await prisma.project.deleteMany({ where: { userId: u } });
        await prisma.client.deleteMany({ where: { userId: u } });
        await admin.auth.admin.deleteUser(u);
      }
      await prisma.$disconnect();
    }, TIMEOUT);

    test(
      "facture payée → envoye : statut remis et paidAt effacé",
      async () => {
        activeUserId = userA;
        expect(await updateDocumentStatus(paidInvoiceA, "envoye")).toEqual({
          ok: true,
        });
        const doc = await prisma.document.findUnique({
          where: { id: paidInvoiceA },
          select: { status: true, paidAt: true },
        });
        expect(doc).toEqual({ status: "envoye", paidAt: null });

        // Et de nouveau payable ensuite (aller-retour complet).
        expect(await updateDocumentStatus(paidInvoiceA, "paye")).toEqual({
          ok: true,
        });
        const again = await prisma.document.findUnique({
          where: { id: paidInvoiceA },
          select: { status: true, paidAt: true },
        });
        expect(again?.status).toBe("paye");
        expect(again?.paidAt).not.toBeNull();
      },
      TIMEOUT,
    );

    test(
      "devis accepté → envoye : remis en attente de réponse",
      async () => {
        activeUserId = userA;
        expect(await updateDocumentStatus(acceptedQuoteA, "envoye")).toEqual({
          ok: true,
        });
        const doc = await prisma.document.findUnique({
          where: { id: acceptedQuoteA },
          select: { status: true },
        });
        expect(doc?.status).toBe("envoye");
      },
      TIMEOUT,
    );

    test(
      "devis déjà converti : toute modification de décision refusée, devis inchangé",
      async () => {
        activeUserId = userA;
        for (const target of ["envoye", "refuse"]) {
          const res = await updateDocumentStatus(convertedQuoteA, target);
          expect("error" in res && res.error).toContain("converti en facture");
        }
        const doc = await prisma.document.findUnique({
          where: { id: convertedQuoteA },
          select: { status: true },
        });
        expect(doc?.status).toBe("accepte");
      },
      TIMEOUT,
    );

    test(
      "ISOLATION : A ne peut pas annuler le paiement d'une facture de B",
      async () => {
        activeUserId = userA;
        const res = await updateDocumentStatus(paidInvoiceB, "envoye");
        expect(res).toEqual({ error: "Document introuvable." });
        const doc = await prisma.document.findUnique({
          where: { id: paidInvoiceB },
          select: { status: true, paidAt: true },
        });
        expect(doc?.status).toBe("paye");
        expect(doc?.paidAt).not.toBeNull();
      },
      TIMEOUT,
    );
  });
}
