// Vérification réelle de getDashboardData() et getNavCounts() (#47) contre un
// calcul fait à la main. Même pattern que reports-data.integration.ts :
// mock.module de la session AVANT import dynamique, vraie base, vrais users
// Auth, nettoyage complet en afterAll.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DashboardData } from "@/app/(app)/dashboard/actions";
import type { NavCounts } from "@/app/(app)/nav-counts";

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
  describe.skip("Dashboard — KPI/graphe/priorité/top clients (#47)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  const { getDashboardData } = await import("@/app/(app)/dashboard/actions");
  const { getNavCounts } = await import("@/app/(app)/nav-counts");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-dash-${RUN_ID}-Aa1!`;

  // On travaille en dates RELATIVES à maintenant pour rester déterministe
  // quelle que soit la date d'exécution (jour du mois, trimestre courant...).
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth();

  // Un jour "au milieu" du mois donné (offset en mois depuis le mois courant).
  // day=10 pour éviter les bords de mois.
  const dayInMonth = (offset: number, day = 10) =>
    new Date(Date.UTC(curY, curM + offset, day));

  // Bornes utiles.
  const monthStart = new Date(Date.UTC(curY, curM, 1));

  async function createRealUser(slug: string) {
    const email = `test-dash-${slug}-${RUN_ID}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`Création user ${slug} échouée : ${error?.message}`);
    }
    return { id: data.user.id, email };
  }

  async function createClientAndProject(userId: string, label: string) {
    const client = await prisma.client.create({
      data: { userId, name: `Client dash ${label} ${RUN_ID}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet dash ${label} ${RUN_ID}` },
      select: { id: true },
    });
    return { clientId: client.id, projectId: project.id, clientName: `Client dash ${label} ${RUN_ID}` };
  }

  type DocSpec = {
    projectId: string;
    type: "facture" | "devis";
    status: "brouillon" | "envoye" | "accepte" | "refuse" | "paye";
    number?: string | null;
    totalHtCents: number;
    totalTtcCents: number;
    issuedAt?: Date;
    emittedAt?: Date;
    dueAt?: Date;
    paidAt?: Date;
  };

  async function createDoc(userId: string, spec: DocSpec) {
    await prisma.document.create({
      data: {
        userId,
        projectId: spec.projectId,
        type: spec.type,
        status: spec.status,
        number: spec.number ?? null,
        totalHtCents: spec.totalHtCents,
        totalTvaCents: spec.totalTtcCents - spec.totalHtCents,
        totalTtcCents: spec.totalTtcCents,
        issuedAt: spec.issuedAt ?? null,
        emittedAt: spec.emittedAt ?? null,
        dueAt: spec.dueAt ?? null,
        paidAt: spec.paidAt ?? null,
      },
    });
  }

  describe("Dashboard — KPI/graphe/priorité/top clients (#47)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let userEdge: { id: string; email: string };
    let projs: Record<string, Awaited<ReturnType<typeof createClientAndProject>>> = {};
    let projB: Awaited<ReturnType<typeof createClientAndProject>>;

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      userEdge = await createRealUser("edge");
      await new Promise((r) => setTimeout(r, 600));

      const nord = await createClientAndProject(userA.id, "Nord");
      const lumen = await createClientAndProject(userA.id, "Lumen");
      const delmas = await createClientAndProject(userA.id, "Delmas");
      projs = { nord, lumen, delmas };

      // --- KPI CA encaissé : 2 factures payées CE mois-ci (HT 100000 + 40000) --
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "facture", status: "paye",
        number: "FAC-A-1", totalHtCents: 100_000, totalTtcCents: 120_000,
        issuedAt: dayInMonth(0, 3), emittedAt: dayInMonth(0, 3),
        paidAt: dayInMonth(0, 8),
      });
      await createDoc(userA.id, {
        projectId: lumen.projectId, type: "facture", status: "paye",
        number: "FAC-A-2", totalHtCents: 40_000, totalTtcCents: 48_000,
        issuedAt: dayInMonth(0, 4), emittedAt: dayInMonth(0, 4),
        paidAt: dayInMonth(0, 9),
      });
      // Facture payée le MOIS DERNIER (HT 70000) -> delta de CA.
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "facture", status: "paye",
        number: "FAC-A-3", totalHtCents: 70_000, totalTtcCents: 84_000,
        issuedAt: dayInMonth(-1, 3), emittedAt: dayInMonth(-1, 3),
        paidAt: dayInMonth(-1, 20),
      });

      // --- Facture EN ATTENTE (envoye, échéance future) HT 30000 --------------
      await createDoc(userA.id, {
        projectId: lumen.projectId, type: "facture", status: "envoye",
        number: "FAC-A-4", totalHtCents: 30_000, totalTtcCents: 36_000,
        issuedAt: dayInMonth(0, 5), emittedAt: dayInMonth(0, 5),
        dueAt: new Date(now.getTime() + 15 * 86_400_000),
      });
      // Facture envoyée, SANS échéance -> aussi "en attente".
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "facture", status: "envoye",
        number: "FAC-A-5", totalHtCents: 10_000, totalTtcCents: 12_000,
        issuedAt: dayInMonth(0, 6), emittedAt: dayInMonth(0, 6),
        dueAt: undefined,
      });

      // --- Factures EN RETARD (envoye, échéance passée) -----------------------
      // La plus en retard : échéance il y a 12 jours, TTC 68000.
      await createDoc(userA.id, {
        projectId: delmas.projectId, type: "facture", status: "envoye",
        number: "FAC-2026-031", totalHtCents: 60_000, totalTtcCents: 68_000,
        issuedAt: dayInMonth(-1, 15), emittedAt: dayInMonth(-1, 15),
        dueAt: new Date(now.getTime() - 12 * 86_400_000),
      });
      // Retard 5 jours, TTC 40000.
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "facture", status: "envoye",
        number: "FAC-2026-028", totalHtCents: 34_000, totalTtcCents: 40_000,
        issuedAt: dayInMonth(-1, 18), emittedAt: dayInMonth(-1, 18),
        dueAt: new Date(now.getTime() - 5 * 86_400_000),
      });

      // --- Devis à relancer (envoye) ------------------------------------------
      // Émis il y a 9 jours, TTC 2400.
      await createDoc(userA.id, {
        projectId: lumen.projectId, type: "devis", status: "envoye",
        number: "DEV-2026-014", totalHtCents: 200_000, totalTtcCents: 240_000,
        issuedAt: dayInMonth(0, 1),
        emittedAt: new Date(now.getTime() - 9 * 86_400_000),
      });
      // Émis il y a 6 jours, TTC 1800 (emittedAt null -> repli issuedAt).
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "devis", status: "envoye",
        number: "DEV-2026-016", totalHtCents: 150_000, totalTtcCents: 180_000,
        issuedAt: new Date(now.getTime() - 6 * 86_400_000),
        emittedAt: undefined,
      });
      // Devis accepté (ne compte PAS dans "à relancer").
      await createDoc(userA.id, {
        projectId: delmas.projectId, type: "devis", status: "accepte",
        number: "DEV-2026-010", totalHtCents: 50_000, totalTtcCents: 60_000,
        issuedAt: dayInMonth(0, 2), emittedAt: dayInMonth(0, 2),
      });
      // Devis brouillon (compte dans navCounts devis, pas dans "à relancer"
      // ni dans top clients).
      await createDoc(userA.id, {
        projectId: delmas.projectId, type: "devis", status: "brouillon",
        totalHtCents: 999_999, totalTtcCents: 999_999,
        issuedAt: dayInMonth(0, 2),
      });

      // --- Graphe : une facture payée il y a 3 mois (HT 25000) ----------------
      await createDoc(userA.id, {
        projectId: nord.projectId, type: "facture", status: "paye",
        number: "FAC-A-OLD", totalHtCents: 25_000, totalTtcCents: 30_000,
        issuedAt: dayInMonth(-3, 5), emittedAt: dayInMonth(-3, 5),
        paidAt: dayInMonth(-3, 10),
      });

      // --- userB : isolation (montant distinctif) -----------------------------
      projB = await createClientAndProject(userB.id, "B1");
      await createDoc(userB.id, {
        projectId: projB.projectId, type: "facture", status: "paye",
        number: "FAC-B-1", totalHtCents: 888_888, totalTtcCents: 900_000,
        issuedAt: dayInMonth(0, 3), emittedAt: dayInMonth(0, 3),
        paidAt: dayInMonth(0, 5),
      });

      // userEdge : aucune donnée.
    }, 60_000);

    afterAll(async () => {
      const users = [userA, userB, userEdge];
      for (const u of users) {
        try {
          if (u?.id) await prisma.document.deleteMany({ where: { userId: u.id } });
        } catch (e) {
          console.warn(`Nettoyage documents (${u?.email}) :`, e);
        }
      }
      const allProjects = [...Object.values(projs ?? {}), projB].filter(Boolean);
      for (const p of allProjects) {
        try {
          if (p?.projectId) await prisma.project.delete({ where: { id: p.projectId } });
        } catch (e) {
          console.warn("Nettoyage projet :", e);
        }
      }
      for (const p of allProjects) {
        try {
          if (p?.clientId) await prisma.client.delete({ where: { id: p.clientId } });
        } catch (e) {
          console.warn("Nettoyage client :", e);
        }
      }
      await prisma.$disconnect();
      for (const u of users) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression user (${u?.email}) :`, e);
        }
      }
    }, 30_000);

    test("KPI : CA encaissé + delta, en attente, en retard, devis à relancer", async () => {
      activeUserId = userA.id;
      const data: DashboardData = await getDashboardData();

      // CA encaissé ce mois = 100000 + 40000 = 140000 (HT).
      expect(data.kpis.caEncaisseCents).toBe(140_000);
      // Delta vs mois dernier (70000) : (140000-70000)/70000 = 100%.
      expect(data.kpis.caEncaisseDeltaPct).toBe(100);

      // En attente : 30000 + 10000 = 40000, 2 factures.
      expect(data.kpis.enAttenteCents).toBe(40_000);
      expect(data.kpis.enAttenteCount).toBe(2);

      // En retard : 60000 + 34000 = 94000, 2 factures.
      expect(data.kpis.enRetardCents).toBe(94_000);
      expect(data.kpis.enRetardCount).toBe(2);

      // Devis à relancer : 2 (DEV-014, DEV-016), potentiel HT 200000+150000.
      expect(data.kpis.devisARelancerCount).toBe(2);
      expect(data.kpis.devisPotentielCents).toBe(350_000);

      // todayLabel : 1ʳᵉ lettre majuscule.
      expect(data.todayLabel[0]).toBe(data.todayLabel[0].toUpperCase());
      expect(data.todayLabel).not.toContain("·");
    }, 20_000);

    test("Panneau priorité : factures en retard d'abord (plus en retard en tête), puis devis à relancer", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData();

      expect(data.priority.overdueCount).toBe(2);
      // Ordre : FAC-031 (12j) puis FAC-028 (5j) puis DEV-014 (9j) puis DEV-016 (6j).
      const seq = data.priority.items.map((i) => i.number);
      expect(seq).toEqual([
        "FAC-2026-031",
        "FAC-2026-028",
        "DEV-2026-014",
        "DEV-2026-016",
      ]);
      expect(data.priority.items[0]).toMatchObject({
        kind: "facture_retard",
        amountTtcCents: 68_000,
        days: 12,
      });
      expect(data.priority.items[1]).toMatchObject({ days: 5, amountTtcCents: 40_000 });
      expect(data.priority.items[2]).toMatchObject({
        kind: "devis_relance",
        days: 9,
        amountTtcCents: 240_000,
      });
      expect(data.priority.items[3]).toMatchObject({ days: 6, amountTtcCents: 180_000 });
      // Montants du panneau en TTC (pas HT).
      expect(data.priority.items[2].amountTtcCents).not.toBe(200_000);
    }, 20_000);

    test("Factures récentes : 5 max, émises, statut effectif (en_retard dérivé), TTC", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData();

      expect(data.recentInvoices.length).toBeLessThanOrEqual(5);
      // Toutes ont un numéro.
      for (const inv of data.recentInvoices) {
        expect(inv.number).not.toBe("");
      }
      // La facture FAC-2026-031 doit ressortir en_retard (dérivé).
      const overdue = data.recentInvoices.find((i) => i.number === "FAC-2026-031");
      if (overdue) {
        expect(overdue.status).toBe("en_retard");
        expect(overdue.amountTtcCents).toBe(68_000);
      }
      // Aucune ne doit être "brouillon".
      for (const inv of data.recentInvoices) {
        expect(["envoye", "paye", "en_retard"]).toContain(inv.status);
      }
    }, 20_000);

    test("Graphe : 8 mois glissants, mois courant = CA encaissé, HT", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData();

      expect(data.monthlyRevenue).toHaveLength(8);
      // Dernier bucket = mois courant : paid 140000, pending = issuedAt ce mois
      // (FAC-A-4 30000 + FAC-A-5 10000 = 40000).
      const last = data.monthlyRevenue[7];
      expect(last.paidCents).toBe(140_000);
      expect(last.pendingCents).toBe(40_000);
      // Somme totale des paid = 140000 (ce mois) + 70000 (mois dernier, FAC-A-3)
      // + 25000 (il y a 3 mois) = 235000.
      const sumPaid = data.monthlyRevenue.reduce((s, m) => s + m.paidCents, 0);
      expect(sumPaid).toBe(235_000);
      // Mois précédent = bucket 6 : 70000 payé.
      expect(data.monthlyRevenue[6].paidCents).toBe(70_000);
    }, 20_000);

    test("Top clients (trimestre) : parts en %, top 4 + autres, HT documents émis", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData();

      expect(data.topClients).not.toBeNull();
      const tc = data.topClients!;
      // Somme des pct top + others ~ 100 (arrondis).
      const total = tc.items.reduce((s, i) => s + i.pct, 0) + tc.othersPct;
      expect(Math.abs(total - 100)).toBeLessThanOrEqual(2);
      expect(tc.items.length).toBeLessThanOrEqual(4);

      // A n'a que 3 clients -> tous rentrent dans le top 4, "Autres" = 0.
      expect(tc.items.length).toBe(3);
      expect(tc.othersPct).toBe(0);
      // Chaque nom appartient à A (aucun nom de B).
      for (const it of tc.items) {
        expect(it.clientName).toContain(RUN_ID);
        expect(it.clientName).not.toBe(projB.clientName);
      }

      // GARDE-FOU BROUILLON : le devis brouillon (HT 999999, client Delmas) doit
      // être EXCLU. S'il fuitait, il pèserait ~1M contre <300k pour tout le
      // reste du trimestre -> Delmas passerait en tête à >70 %. Sans lui, Delmas
      // (au plus 110000 HT sur le trimestre) ne peut JAMAIS dominer, et aucune
      // part ne dépasse ~63 % (Lumen, borne haute). Ces seuils tiennent quelle
      // que soit la date d'exécution (les autres mois ne font qu'agrandir le
      // dénominateur). Une part >= 70 % = brouillon fuité.
      const delmas = tc.items.find((i) => i.clientName.includes("Delmas"));
      expect(delmas).toBeDefined();
      expect(delmas!.pct).toBeLessThan(40);
      expect(tc.items[0].clientName).not.toContain("Delmas");
      for (const it of tc.items) expect(it.pct).toBeLessThan(70);
    }, 20_000);

    test("NavCounts : comptes exacts (devis + brouillons inclus)", async () => {
      activeUserId = userA.id;
      const counts: NavCounts = await getNavCounts();
      expect(counts.clients).toBe(3);
      expect(counts.projets).toBe(3);
      // Devis : DEV-014, DEV-016, DEV-010, brouillon = 4.
      expect(counts.devis).toBe(4);
      // Factures : FAC-A-1,2,3,4,5, FAC-031, FAC-028, FAC-A-OLD = 8.
      expect(counts.factures).toBe(8);
    }, 20_000);

    test("Isolation : les données de B (888888) n'apparaissent jamais chez A", async () => {
      activeUserId = userA.id;
      const dataA = await getDashboardData();
      expect(dataA.kpis.caEncaisseCents).toBe(140_000);
      expect(dataA.kpis.caEncaisseCents).not.toBe(140_000 + 888_888);
      // Aucune trace de B dans la charge utile SÉRIALISÉE de A (nom OU montant
      // distinctif), y compris priority/recent/topClients/graphe.
      const blobA = JSON.stringify(dataA);
      expect(blobA).not.toContain(projB.clientName);
      expect(blobA).not.toContain("888888");
      expect(blobA).not.toContain("900000");

      activeUserId = userB.id;
      const dataB = await getDashboardData();
      expect(dataB.kpis.caEncaisseCents).toBe(888_888);
      // B n'a payé qu'au mois courant : mois précédent = 0 -> delta null (pas de
      // division par zéro alors que le CA du mois n'est PAS nul).
      expect(dataB.kpis.caEncaisseDeltaPct).toBeNull();
      // Réciproque : aucun nom de client de A ne fuite chez B.
      const blobB = JSON.stringify(dataB);
      for (const p of Object.values(projs)) {
        expect(blobB).not.toContain(p.clientName);
      }
      // B n'a qu'une facture PAYÉE : rien en attente/retard, priorité vide.
      expect(dataB.priority.items).toEqual([]);
      expect(dataB.priority.overdueCount).toBe(0);
      expect(dataB.recentInvoices.map((i) => i.clientName)).toEqual([
        projB.clientName,
      ]);
      expect(dataB.topClients!.items).toEqual([
        { clientName: projB.clientName, pct: 100 },
      ]);

      const countsB = await getNavCounts();
      expect(countsB.clients).toBe(1);
      expect(countsB.projets).toBe(1);
      expect(countsB.factures).toBe(1);
      expect(countsB.devis).toBe(0);
    }, 30_000);

    test("Compte vierge : tout à zéro, aucune exception, topClients null", async () => {
      activeUserId = userEdge.id;
      const data = await getDashboardData();

      expect(data.kpis.caEncaisseCents).toBe(0);
      expect(data.kpis.caEncaisseDeltaPct).toBeNull();
      expect(data.kpis.enAttenteCents).toBe(0);
      expect(data.kpis.enAttenteCount).toBe(0);
      expect(data.kpis.enRetardCount).toBe(0);
      expect(data.kpis.devisARelancerCount).toBe(0);
      expect(data.kpis.devisPotentielCents).toBe(0);
      expect(data.monthlyRevenue).toHaveLength(8);
      for (const m of data.monthlyRevenue) {
        expect(m.paidCents).toBe(0);
        expect(m.pendingCents).toBe(0);
      }
      expect(data.priority.overdueCount).toBe(0);
      expect(data.priority.items).toEqual([]);
      expect(data.recentInvoices).toEqual([]);
      expect(data.topClients).toBeNull();

      const counts = await getNavCounts();
      expect(counts).toEqual({ clients: 0, projets: 0, devis: 0, factures: 0 });
    }, 20_000);
  });

  // Silence le lint sur monthStart (documente la borne, non réutilisée en assert).
  void monthStart;
}
