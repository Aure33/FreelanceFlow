// Agrégats financiers réels des fiches client & projet (issue #86) contre une
// base réelle, valeurs recalculées à la main. Même patron que
// dashboard-data.integration.ts : mock session AVANT import dynamique, vrais
// users A/B, nettoyage exhaustif. Isolation prouvée : getClientFiche/getProject
// « comme B » sur les données de A → null ; aucune pièce de B chez A.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 45_000;
const DAY = 86_400_000;

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
  describe.skip("Fiches — agrégats financiers (#86)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));

  const { getClientFiche } = await import("@/app/(app)/clients/actions");
  const { getProject } = await import("@/app/(app)/projets/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-fiche-${RUN}-Aa1!`;
  const now = Date.now();

  async function createRealUser(slug: string) {
    const email = `test-fiche-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  describe("Fiches — agrégats financiers (#86)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let clientAId = "";
    let projectP1 = "";
    let projectP2 = "";
    let clientBId = "";
    let projectBId = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 500));

      const clientA = await prisma.client.create({
        data: { userId: userA.id, name: `Client A ${RUN}` },
        select: { id: true },
      });
      clientAId = clientA.id;
      const p1 = await prisma.project.create({
        data: { userId: userA.id, clientId: clientAId, name: `P1 ${RUN}` },
        select: { id: true },
      });
      const p2 = await prisma.project.create({
        data: { userId: userA.id, clientId: clientAId, name: `P2 ${RUN}` },
        select: { id: true },
      });
      projectP1 = p1.id;
      projectP2 = p2.id;

      const mk = (o: {
        projectId: string; type: string; status: string; number: string | null;
        htCents: number; ttcCents: number;
        issuedDaysAgo?: number; paidDaysAgo?: number; dueDaysAgo?: number;
      }) => ({
        userId: userA.id,
        projectId: o.projectId,
        type: o.type,
        status: o.status,
        number: o.number,
        totalHtCents: o.htCents,
        totalTvaCents: o.ttcCents - o.htCents,
        totalTtcCents: o.ttcCents,
        issuedAt: o.issuedDaysAgo != null ? new Date(now - o.issuedDaysAgo * DAY) : null,
        emittedAt: o.number ? new Date(now - (o.issuedDaysAgo ?? 10) * DAY) : null,
        paidAt: o.paidDaysAgo != null ? new Date(now - o.paidDaysAgo * DAY) : null,
        dueAt: o.dueDaysAgo != null ? new Date(now - o.dueDaysAgo * DAY) : null,
      });

      await prisma.document.createMany({
        data: [
          // P1 : devis accepté (budget 50 000 HT), facture payée (10 000 HT,
          // délai 10 j), facture envoyée impayée en retard (20 000 HT), brouillon.
          mk({ projectId: projectP1, type: "devis", status: "accepte", number: `DEV-${RUN}-1`, htCents: 50000, ttcCents: 60000, issuedDaysAgo: 20 }),
          mk({ projectId: projectP1, type: "facture", status: "paye", number: `FAC-${RUN}-1`, htCents: 10000, ttcCents: 12000, issuedDaysAgo: 15, paidDaysAgo: 5 }),
          mk({ projectId: projectP1, type: "facture", status: "envoye", number: `FAC-${RUN}-2`, htCents: 20000, ttcCents: 24000, issuedDaysAgo: 30, dueDaysAgo: 3 }),
          mk({ projectId: projectP1, type: "devis", status: "brouillon", number: null, htCents: 9999, ttcCents: 9999 }),
          // P2 : facture payée (30 000 HT, délai 6 j) — compte pour le CLIENT.
          mk({ projectId: projectP2, type: "facture", status: "paye", number: `FAC-${RUN}-3`, htCents: 30000, ttcCents: 36000, issuedDaysAgo: 8, paidDaysAgo: 2 }),
        ],
      });

      // Données de B (cible d'isolation).
      const clientB = await prisma.client.create({
        data: { userId: userB.id, name: `Client B ${RUN}` },
        select: { id: true },
      });
      clientBId = clientB.id;
      const pB = await prisma.project.create({
        data: { userId: userB.id, clientId: clientBId, name: `PB ${RUN}` },
        select: { id: true },
      });
      projectBId = pB.id;
      await prisma.document.create({
        data: {
          userId: userB.id, projectId: projectBId, type: "facture",
          status: "paye", number: `FAC-${RUN}-B`,
          totalHtCents: 999999, totalTvaCents: 0, totalTtcCents: 999999,
          issuedAt: new Date(now - 10 * DAY), paidAt: new Date(now - 1 * DAY),
        },
      });
    }, TIMEOUT);

    afterAll(async () => {
      for (const u of [userA, userB]) {
        if (!u?.id) continue;
        await prisma.documentLine.deleteMany({ where: { userId: u.id } });
        await prisma.document.deleteMany({ where: { userId: u.id } });
        await prisma.project.deleteMany({ where: { userId: u.id } });
        await prisma.client.deleteMany({ where: { userId: u.id } });
        await prisma.user.deleteMany({ where: { id: u.id } });
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
      await prisma.$disconnect();
    }, TIMEOUT);

    test("fiche client : CA/en attente/pièces/délai + projets + historique", async () => {
      activeUserId = userA.id;
      const fiche = (await getClientFiche(clientAId))!;
      expect(fiche).not.toBeNull();

      // CA encaissé HT de l'année = 10 000 (P1) + 30 000 (P2) = 40 000.
      expect(fiche.stats.caYearHtCents).toBe(40000);
      // En attente HT = facture envoyée impayée = 20 000.
      expect(fiche.stats.pendingHtCents).toBe(20000);
      // Pièces émises (numéro attribué) = DEV-1, FAC-1, FAC-2, FAC-3 = 4.
      expect(fiche.stats.emittedCount).toBe(4);
      // Délai moyen = moyenne(10 j, 6 j) = 8 j.
      expect(fiche.stats.avgPaymentDays).toBe(8);
      // 2 projets rattachés, 5 pièces dans l'historique (brouillon inclus).
      expect(fiche.projects.length).toBe(2);
      expect(fiche.documents.length).toBe(5);
      // Statut effectif : FAC-2 (échue impayée) apparaît « en_retard ».
      expect(
        fiche.documents.find((d) => d.number === `FAC-${RUN}-2`)?.status,
      ).toBe("en_retard");
    }, TIMEOUT);

    test("fiche projet : budget/facturé/encaissé/en attente + documents", async () => {
      activeUserId = userA.id;
      const p1 = (await getProject(projectP1))!;
      expect(p1).not.toBeNull();
      // Budget = devis accepté = 50 000 HT.
      expect(p1.budgetHtCents).toBe(50000);
      // Facturé = factures émises HT = 10 000 + 20 000 = 30 000.
      expect(p1.invoicedHtCents).toBe(30000);
      expect(p1.paidHtCents).toBe(10000);
      expect(p1.pendingHtCents).toBe(20000);
      // 4 documents rattachés à P1 (2 devis + 2 factures).
      expect(p1.documentsCount).toBe(4);
      expect(p1.documents.length).toBe(4);
    }, TIMEOUT);

    test("isolation A/B : B ne lit ni la fiche client ni le projet de A", async () => {
      activeUserId = userB.id;
      expect(await getClientFiche(clientAId)).toBeNull();
      expect(await getProject(projectP1)).toBeNull();

      // Et la fiche de B ne contient jamais une pièce de A.
      activeUserId = userB.id;
      const ficheB = (await getClientFiche(clientBId))!;
      expect(ficheB.stats.caYearHtCents).toBe(999999); // seulement SA facture
      expect(
        ficheB.documents.some((d) => (d.number ?? "").includes(`FAC-${RUN}-1`)),
      ).toBe(false);
    }, TIMEOUT);
  });
}
