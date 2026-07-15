// Pagination / tri / filtres serveur (issue #70) contre une base réelle.
// Même patron que dashboard-data.integration.ts : mock de la session AVANT
// import dynamique, vrais users A/B, nettoyage exhaustif en afterAll.
//
// On vérifie surtout les BORNES (première/dernière page, page hors limites) et
// l'ISOLATION A/B : les totaux et compteurs de A ne comptent JAMAIS les données
// de B (si le filtre `userId` sautait, ces assertions basculeraient au rouge).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 60_000;
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
  describe.skip("Pagination / tri / filtres (#70)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));

  const { listClients } = await import("@/app/(app)/clients/actions");
  const { listDocuments, getDocumentCounts } = await import(
    "@/app/(app)/documents/actions"
  );
  const { listProjects, getProjectCounts } = await import(
    "@/app/(app)/projets/actions"
  );

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-pag-${RUN}-Aa1!`;
  const now = Date.now();

  async function createRealUser(slug: string) {
    const email = `test-pag-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  describe("Pagination / tri / filtres (#70)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let projectA = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 500));

      // --- Clients A : 13 (2 pages de 10). B : 5 (leurres d'isolation).
      await prisma.client.createMany({
        data: Array.from({ length: 13 }, (_, i) => ({
          userId: userA.id,
          name: `Client A ${String(i).padStart(2, "0")} ${RUN}`,
        })),
      });
      await prisma.client.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          userId: userB.id,
          name: `Client B ${i} ${RUN}`,
        })),
      });

      // --- Projets A : 14 (8 en_cours, 4 termine, 2 en_pause) → 2 pages de 12.
      const statusesA = [
        ...Array(8).fill("en_cours"),
        ...Array(4).fill("termine"),
        ...Array(2).fill("en_pause"),
      ];
      const clientA0 = await prisma.client.findFirst({
        where: { userId: userA.id },
        select: { id: true },
      });
      await prisma.project.createMany({
        data: statusesA.map((status, i) => ({
          userId: userA.id,
          clientId: clientA0!.id,
          name: `Projet A ${String(i).padStart(2, "0")} ${RUN}`,
          status,
        })),
      });
      // B : 3 projets (isolation).
      const clientB0 = await prisma.client.findFirst({
        where: { userId: userB.id },
        select: { id: true },
      });
      await prisma.project.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({
          userId: userB.id,
          clientId: clientB0!.id,
          name: `Projet B ${i} ${RUN}`,
          status: "en_cours",
        })),
      });

      // --- Factures A : 2 payées + 3 en retard + 12 en attente + 1 brouillon
      //     = 18 (envoye pending sur 2 pages). + 3 devis (statuts directs).
      projectA = (await prisma.project.findFirst({
        where: { userId: userA.id },
        select: { id: true },
      }))!.id;

      const facturesData = [
        ...Array(2).fill(0).map((_, i) => ({
          type: "facture", status: "paye",
          number: `FAC-${RUN}-PAYE-${i}`,
          dueAt: new Date(now - 20 * DAY), paidAt: new Date(now - 2 * DAY),
        })),
        ...Array(3).fill(0).map((_, i) => ({
          type: "facture", status: "envoye",
          number: `FAC-${RUN}-RET-${i}`,
          dueAt: new Date(now - 10 * DAY), paidAt: null,
        })),
        ...Array(12).fill(0).map((_, i) => ({
          type: "facture", status: "envoye",
          number: `FAC-${RUN}-ATT-${String(i).padStart(2, "0")}`,
          dueAt: new Date(now + 30 * DAY), paidAt: null,
        })),
        { type: "facture", status: "brouillon", number: null, dueAt: null, paidAt: null },
        // Devis (statuts directs, ne doivent PAS compter dans les factures).
        { type: "devis", status: "brouillon", number: null, dueAt: null, paidAt: null },
        { type: "devis", status: "envoye", number: `DEV-${RUN}-E`, dueAt: null, paidAt: null },
        { type: "devis", status: "accepte", number: `DEV-${RUN}-A`, dueAt: null, paidAt: null },
      ];
      await prisma.document.createMany({
        data: facturesData.map((d, i) => ({
          userId: userA.id,
          projectId: projectA,
          type: d.type,
          number: d.number,
          status: d.status,
          totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200,
          issuedAt: d.number ? new Date(now - (30 - i) * DAY) : null,
          emittedAt: d.number ? new Date(now - (30 - i) * DAY) : null,
          dueAt: d.dueAt,
          paidAt: d.paidAt,
        })),
      });

      // B : 4 factures en retard rattachées à SON projet (isolation).
      const projectB = (await prisma.project.findFirst({
        where: { userId: userB.id },
        select: { id: true },
      }))!.id;
      await prisma.document.createMany({
        data: Array.from({ length: 4 }, (_, i) => ({
          userId: userB.id,
          projectId: projectB,
          type: "facture",
          status: "envoye",
          number: `FAC-${RUN}-B-${i}`,
          totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200,
          dueAt: new Date(now - 5 * DAY),
        })),
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

    // ---- Clients ------------------------------------------------------------
    test("clients : bornes de pagination + isolation", async () => {
      activeUserId = userA.id;

      const p1 = await listClients(undefined); // page 1 par défaut
      expect(p1.pagination.total).toBe(13); // PAS 18 (les 5 de B exclus)
      expect(p1.pagination.totalPages).toBe(2);
      expect(p1.items.length).toBe(10);

      const p2 = await listClients("2");
      expect(p2.items.length).toBe(3);
      expect(p2.pagination.page).toBe(2);

      // Page hors limites → ramenée à la dernière (2), pas d'items fantômes.
      const p99 = await listClients("99");
      expect(p99.pagination.page).toBe(2);
      expect(p99.items.length).toBe(3);

      // Aucun chevauchement entre page 1 et page 2 (skip correct).
      const ids1 = new Set(p1.items.map((c) => c.id));
      expect(p2.items.some((c) => ids1.has(c.id))).toBe(false);
    }, TIMEOUT);

    // ---- Projets ------------------------------------------------------------
    test("projets : compteurs, filtre, tri, pagination + isolation", async () => {
      activeUserId = userA.id;

      const counts = await getProjectCounts();
      expect(counts).toEqual({ all: 14, en_cours: 8, termine: 4, en_pause: 2 });

      const p1 = await listProjects({});
      expect(p1.pagination.total).toBe(14);
      expect(p1.pagination.totalPages).toBe(2);
      expect(p1.items.length).toBe(12);
      const p2 = await listProjects({ page: "2" });
      expect(p2.items.length).toBe(2);

      // Filtre en_cours : 8 → une seule page.
      const enCours = await listProjects({ status: "en_cours" });
      expect(enCours.pagination.total).toBe(8);
      expect(enCours.items.every((p) => p.status === "en_cours")).toBe(true);

      // Tri alphabétique vs récent : premier élément différent, tri respecté.
      const byName = await listProjects({ sort: "nom" });
      const names = byName.items.map((p) => p.name);
      expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }, TIMEOUT);

    // ---- Documents ----------------------------------------------------------
    test("documents : compteurs par statut effectif, filtres, pagination, isolation", async () => {
      activeUserId = userA.id;

      const counts = await getDocumentCounts("facture");
      expect(counts.counts.all).toBe(18); // PAS 22 (les 4 de B exclus)
      expect(counts.counts.paye).toBe(2);
      expect(counts.counts.en_retard).toBe(3); // dérivé (envoye + échu)
      expect(counts.counts.envoye).toBe(12); // « en attente » (envoye non échu)
      expect(counts.counts.brouillon).toBe(1);
      // Cohérence : la somme des sous-ensembles disjoints = total.
      expect(
        counts.counts.paye +
          counts.counts.en_retard +
          counts.counts.envoye +
          counts.counts.brouillon,
      ).toBe(counts.counts.all);

      // Les devis ne polluent pas les factures.
      const devisCounts = await getDocumentCounts("devis");
      expect(devisCounts.counts.all).toBe(3);
      expect(devisCounts.counts.accepte).toBe(1);

      // Filtre « en attente » : 12 → 2 pages (10 + 2).
      const att1 = await listDocuments("facture", { status: "envoye" });
      expect(att1.pagination.total).toBe(12);
      expect(att1.pagination.totalPages).toBe(2);
      expect(att1.items.length).toBe(10);
      expect(att1.items.every((d) => d.status === "envoye")).toBe(true);
      const att2 = await listDocuments("facture", { status: "envoye", page: "2" });
      expect(att2.items.length).toBe(2);

      // Filtre « en retard » : seulement les 3 échues, statut effectif dérivé.
      const ret = await listDocuments("facture", { status: "en_retard" });
      expect(ret.pagination.total).toBe(3);
      expect(ret.items.every((d) => d.status === "en_retard")).toBe(true);

      // Isolation : aucune pièce de B (numéro FAC-…-B…) chez A.
      const all2 = await listDocuments("facture", { page: "2" });
      const allNums = [...att1.items, ...all2.items].map((d) => d.number ?? "");
      expect(allNums.some((n) => n.includes("-B"))).toBe(false);
    }, TIMEOUT);
  });
}
