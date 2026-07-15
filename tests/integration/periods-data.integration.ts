// Vérification réelle des segments de période (#65) : getDashboardData(period)
// et getReportsData(period) contre un calcul fait à la main. Même patron que
// dashboard-data.integration.ts : mock.module de la session AVANT import
// dynamique, vraie base (projet Supabase DEV, jamais la prod #17), vrais users
// Auth A/B, nettoyage complet en afterAll.
//
// DÉTERMINISME : les fixtures sont placées par rapport aux FENÊTRES calculées
// par lib/periods (importé ici, logique pure) — paidAt = start de la fenêtre
// visée + 1 h — et les attendus sont recalculés dans le test via paidSum().
// Le test reste donc vrai quelle que soit la date d'exécution (janvier,
// changement de trimestre, année bissextile...). Seul le cas « mois » est EN
// PLUS codé en dur (80 000 / +100 %) : ses fixtures ne peuvent jamais changer
// de fenêtre relative (démonstration dans les commentaires des fixtures).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dashboardWindow,
  reportsWindow,
  type DashboardPeriod,
  type ReportsPeriod,
} from "@/lib/periods";

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
  describe.skip("Segments de période — dashboard + rapports (#65)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  const { getDashboardData } = await import("@/app/(app)/dashboard/actions");
  const { getReportsData } = await import("@/app/(app)/rapports/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-per-${RUN_ID}-Aa1!`;

  // Une seule référence temporelle pour placer les fixtures. (Les actions
  // recalculent leur propre `new Date()` quelques ms plus tard : identique à
  // l'échelle des fenêtres mensuelles.)
  const now = new Date();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  // --- Emplacements des factures payées, calculés PAR LES FENÊTRES ------------
  // start + 1 h est TOUJOURS dans [start, end) : les fenêtres font au moins un
  // mois. Les 4 emplacements sont deux à deux distincts quel que soit `now`
  // (démonstration : prevStart(mois) = M-1 ; prevStart(trimestre) = premier
  // mois du trimestre précédent ≤ M-3 ; prevStart(annee rapports) = 1er
  // janvier N-1 ≤ M-12).
  const paidThisMonth = new Date(
    dashboardWindow("mois", now).start.getTime() + HOUR,
  );
  const paidPrevMonth = new Date(
    dashboardWindow("mois", now).prevStart.getTime() + HOUR,
  );
  const paidPrevQuarter = new Date(
    dashboardWindow("trimestre", now).prevStart.getTime() + HOUR,
  );
  const paidLastYear = new Date(
    reportsWindow("annee", now).prevStart.getTime() + HOUR,
  );

  // Fixtures « payées » de A (HT en centimes) — la liste sert à recalculer
  // les attendus par fenêtre (paidSum). Montants distinctifs.
  const paidFixtures = [
    { label: "ce mois", ht: 80_000, paidAt: paidThisMonth }, // 800,00 €
    { label: "mois précédent", ht: 40_000, paidAt: paidPrevMonth }, // 400,00 €
    { label: "trimestre précédent", ht: 25_000, paidAt: paidPrevQuarter },
    { label: "année dernière", ht: 11_111, paidAt: paidLastYear },
  ] as const;

  // Somme HT des factures payées dont paidAt ∈ [from, to) — le MÊME calcul
  // que celui attendu des actions, refait à la main sur les fixtures.
  const paidSum = (from: Date, to: Date) =>
    paidFixtures
      .filter((f) => f.paidAt >= from && f.paidAt < to)
      .reduce((s, f) => s + f.ht, 0);

  const expectedDelta = (cur: number, prev: number) =>
    prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);

  async function createRealUser(slug: string) {
    const email = `test-per-${slug}-${RUN_ID}@freelanceflow.test`;
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

  describe("Segments de période — dashboard + rapports (#65)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let clientAName = "";
    let clientAId = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      // Laisse le trigger on_auth_user_created créer les lignes public.users.
      await new Promise((r) => setTimeout(r, 600));

      clientAName = `Client périodes A ${RUN_ID}`;
      const client = await prisma.client.create({
        data: { userId: userA.id, name: clientAName },
        select: { id: true },
      });
      clientAId = client.id;
      const project = await prisma.project.create({
        data: {
          userId: userA.id,
          clientId: client.id,
          name: `Projet périodes A ${RUN_ID}`,
        },
        select: { id: true },
      });
      // Factures PAYÉES (KPI 1 / CA des rapports) — issuedAt = paidAt (délai 0,
      // sans incidence : on ne teste pas le KPI délais ici).
      let i = 0;
      for (const f of paidFixtures) {
        i += 1;
        await prisma.document.create({
          data: {
            userId: userA.id,
            projectId: project.id,
            type: "facture",
            status: "paye",
            number: `FAC-PER-${i}`,
            totalHtCents: f.ht,
            totalTvaCents: Math.round(f.ht * 0.2),
            totalTtcCents: f.ht + Math.round(f.ht * 0.2),
            issuedAt: f.paidAt,
            emittedAt: f.paidAt,
            paidAt: f.paidAt,
          },
        });
      }

      // KPI 2/3/4 (états INSTANTANÉS, indépendants de la période) :
      // en attente (échéance future), en retard (échéance passée), devis envoyé.
      await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: "FAC-PER-ATT",
          totalHtCents: 30_000,
          totalTvaCents: 6_000,
          totalTtcCents: 36_000,
          issuedAt: now,
          emittedAt: now,
          dueAt: new Date(now.getTime() + 10 * DAY),
        },
      });
      await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "facture",
          status: "envoye",
          number: "FAC-PER-RET",
          totalHtCents: 20_000,
          totalTvaCents: 4_000,
          totalTtcCents: 24_000,
          issuedAt: new Date(now.getTime() - 20 * DAY),
          emittedAt: new Date(now.getTime() - 20 * DAY),
          dueAt: new Date(now.getTime() - 5 * DAY),
        },
      });
      await prisma.document.create({
        data: {
          userId: userA.id,
          projectId: project.id,
          type: "devis",
          status: "envoye",
          number: "DEV-PER-1",
          totalHtCents: 50_000,
          totalTvaCents: 10_000,
          totalTtcCents: 60_000,
          issuedAt: now,
          emittedAt: now,
        },
      });

      // userB : AUCUNE donnée (preuve d'isolation par le vide : si un seul
      // centime de A fuyait chez B, ses zéros deviendraient non nuls).
    }, 60_000);

    afterAll(async () => {
      for (const u of [userA, userB]) {
        try {
          if (u?.id) {
            await prisma.document.deleteMany({ where: { userId: u.id } });
            await prisma.project.deleteMany({ where: { userId: u.id } });
            await prisma.client.deleteMany({ where: { userId: u.id } });
          }
        } catch (e) {
          console.warn(`Nettoyage données (${u?.email}) :`, e);
        }
      }
      await prisma.$disconnect();
      for (const u of [userA, userB]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression user (${u?.email}) :`, e);
        }
      }
    }, 30_000);

    // ------------------------------------------------------------------ dashboard

    test("dashboard 'mois' : CA = 80 000, delta = +100 % (vs 40 000), libellés mois", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData("mois");

      expect(data.period).toBe("mois");
      // Attendus EN DUR (stables toute l'année, cf. note d'en-tête) : seule la
      // facture « ce mois » est dans le mois courant, seule « mois précédent »
      // dans le mois d'avant.
      expect(data.kpis.caEncaisseCents).toBe(80_000);
      expect(data.kpis.caEncaisseDeltaPct).toBe(100);
      expect(data.comparisonLabel).toBe("vs mois dernier");
      expect(data.rangeLabel).toBe("ce mois-ci");
    }, 20_000);

    test("dashboard : défaut sans argument = 'mois'", async () => {
      activeUserId = userA.id;
      const data = await getDashboardData();
      expect(data.period).toBe("mois");
      expect(data.kpis.caEncaisseCents).toBe(80_000);
    }, 20_000);

    test("dashboard 'trimestre' et 'annee' : CA + delta = fenêtres lib/periods recalculées à la main", async () => {
      activeUserId = userA.id;

      for (const period of ["trimestre", "annee"] as DashboardPeriod[]) {
        const win = dashboardWindow(period, now);
        const expectedCa = paidSum(win.start, win.end);
        const expectedPrev = paidSum(win.prevStart, win.prevEnd);

        const data = await getDashboardData(period);
        expect(data.period).toBe(period);
        expect(data.kpis.caEncaisseCents).toBe(expectedCa);
        expect(data.kpis.caEncaisseDeltaPct).toBe(
          expectedDelta(expectedCa, expectedPrev) as number,
        );
        // Le graphe reste 8 mois quelle que soit la fenêtre de comparaison
        // (période « annee » : les seaux remontent jusqu'à N-1 en interne,
        // seuls les 8 derniers sont affichés).
        expect(data.monthlyRevenue).toHaveLength(8);
      }

      // Garde-fou anti-faux-vert : la fenêtre année contient AU MOINS les
      // 80 000 du mois courant, et sa comparaison N-1 complète voit la facture
      // de l'année dernière (11 111) — donc delta non null.
      const annee = await getDashboardData("annee");
      expect(annee.kpis.caEncaisseCents).toBeGreaterThanOrEqual(80_000);
      expect(annee.kpis.caEncaisseDeltaPct).not.toBeNull();
      expect(annee.comparisonLabel).toBe("vs année dernière");
      expect(annee.rangeLabel).toBe("cette année");

      const trimestre = await getDashboardData("trimestre");
      expect(trimestre.comparisonLabel).toBe("vs trimestre dernier");
      expect(trimestre.rangeLabel).toBe("ce trimestre");
    }, 30_000);

    test("dashboard : la période ne change JAMAIS les KPI 2/3/4 (états instantanés)", async () => {
      activeUserId = userA.id;

      const [mois, trimestre, annee] = [
        await getDashboardData("mois"),
        await getDashboardData("trimestre"),
        await getDashboardData("annee"),
      ];

      // Valeurs exactes attendues des fixtures.
      for (const data of [mois, trimestre, annee]) {
        expect(data.kpis.enAttenteCents).toBe(30_000);
        expect(data.kpis.enAttenteCount).toBe(1);
        expect(data.kpis.enRetardCents).toBe(20_000);
        expect(data.kpis.enRetardCount).toBe(1);
        expect(data.kpis.devisARelancerCount).toBe(1);
        expect(data.kpis.devisPotentielCents).toBe(50_000);
        expect(data.priority.overdueCount).toBe(1);
      }
    }, 30_000);

    test("dashboard : top clients suit la fenêtre de la période (issuedAt ∈ [start, end))", async () => {
      activeUserId = userA.id;

      // En « annee », les documents émis cette année (au moins « ce mois »,
      // 80 000 + les envoyées) rendent topClients non nul, 100 % pour l'unique
      // client de A.
      const annee = await getDashboardData("annee");
      expect(annee.topClients).not.toBeNull();
      expect(annee.topClients!.items).toEqual([
        { clientName: clientAName, pct: 100 },
      ]);
      expect(annee.topClients!.othersPct).toBe(0);
    }, 20_000);

    // ------------------------------------------------------------------ rapports

    test("rapports 'annee' (défaut) : CA année en cours, delta vs N-1 À DATE, 12 seaux", async () => {
      activeUserId = userA.id;
      const win = reportsWindow("annee", now);
      const expectedCa = paidSum(win.start, win.end);
      // La comparaison « à date » [prevStart, prevEnd) contient la facture de
      // l'année dernière (1er janvier N-1 + 1 h < prevEnd toujours) : 11 111.
      const expectedPrev = paidSum(win.prevStart, win.prevEnd);
      expect(expectedPrev).toBeGreaterThanOrEqual(11_111);

      const data = await getReportsData("annee");
      expect(data.period).toBe("annee");
      expect(data.kpis.caEncaisseCents).toBe(expectedCa);
      expect(data.kpis.caEncaisseDeltaPct).toBe(
        expectedDelta(expectedCa, expectedPrev) as number,
      );
      expect(data.monthlyRevenue).toHaveLength(12);
      // Le graphe re-somme exactement le CA de la fenêtre.
      const sumPaid = data.monthlyRevenue.reduce((s, m) => s + m.paidCents, 0);
      expect(sumPaid).toBe(expectedCa);
      expect(data.labels.subtitle).toBe(`année ${now.getUTCFullYear()}`);

      const byDefault = await getReportsData();
      expect(byDefault.period).toBe("annee");
      expect(byDefault.kpis.caEncaisseCents).toBe(expectedCa);
    }, 30_000);

    test("rapports '12mois' : CA = 145 000 (année glissante), la facture N-1 est EXCLUE de la fenêtre mais compte dans le delta", async () => {
      activeUserId = userA.id;
      const win = reportsWindow("12mois", now);

      // Les 3 factures « ce mois / mois précédent / trimestre précédent » sont
      // TOUJOURS dans les 12 derniers mois ; celle du 1er janvier N-1 jamais
      // (elle a ≥ 12 mois révolus). Attendu stable toute l'année :
      const expectedCa = paidSum(win.start, win.end);
      expect(expectedCa).toBe(80_000 + 40_000 + 25_000); // 145 000, sans 11 111
      // ... et elle tombe TOUJOURS dans la fenêtre de comparaison (les 12 mois
      // d'avant), donc delta non null.
      const expectedPrev = paidSum(win.prevStart, win.prevEnd);
      expect(expectedPrev).toBe(11_111);

      const data = await getReportsData("12mois");
      expect(data.period).toBe("12mois");
      expect(data.kpis.caEncaisseCents).toBe(145_000);
      expect(data.kpis.caEncaisseDeltaPct).toBe(
        expectedDelta(145_000, 11_111) as number,
      );
      expect(data.monthlyRevenue).toHaveLength(12);
      const sumPaid = data.monthlyRevenue.reduce((s, m) => s + m.paidCents, 0);
      expect(sumPaid).toBe(145_000);
      expect(data.labels.subtitle).toBe("12 derniers mois");
    }, 30_000);

    test("rapports 'trimestre' : 3 seaux, bornes du trimestre calendaire, facture N-1 exclue", async () => {
      activeUserId = userA.id;
      const win = reportsWindow("trimestre", now);
      const expectedCa = paidSum(win.start, win.end);
      // La facture de l'année dernière est forcément HORS du trimestre courant.
      expect(paidLastYear.getTime()).toBeLessThan(win.start.getTime());

      const data = await getReportsData("trimestre");
      expect(data.period).toBe("trimestre");
      expect(data.kpis.caEncaisseCents).toBe(expectedCa);
      // Le trimestre courant contient au moins la facture « ce mois ».
      expect(data.kpis.caEncaisseCents).toBeGreaterThanOrEqual(80_000);
      expect(data.monthlyRevenue).toHaveLength(3);
      const sumPaid = data.monthlyRevenue.reduce((s, m) => s + m.paidCents, 0);
      expect(sumPaid).toBe(expectedCa);
      expect(data.labels.subtitle).toMatch(/^trimestre en cours \(T[1-4] \d{4}\)$/);
    }, 30_000);

    // ------------------------------------------------------------------ isolation

    test("isolation : B ne voit AUCUN centime de A, sur chaque période des 2 actions", async () => {
      activeUserId = userB.id;

      for (const period of ["mois", "trimestre", "annee"] as DashboardPeriod[]) {
        const data = await getDashboardData(period);
        expect(data.kpis.caEncaisseCents).toBe(0);
        expect(data.kpis.caEncaisseDeltaPct).toBeNull();
        expect(data.kpis.enAttenteCents).toBe(0);
        expect(data.kpis.enRetardCents).toBe(0);
        expect(data.kpis.devisARelancerCount).toBe(0);
        expect(data.topClients).toBeNull();
        // Aucune trace de A dans la charge utile SÉRIALISÉE (nom de client,
        // id, ou montant distinctif).
        const blob = JSON.stringify(data);
        expect(blob).not.toContain(clientAName);
        expect(blob).not.toContain(clientAId);
        expect(blob).not.toContain("80000");
        expect(blob).not.toContain("11111");
      }

      for (const period of ["annee", "12mois", "trimestre"] as ReportsPeriod[]) {
        const data = await getReportsData(period);
        expect(data.kpis.caEncaisseCents).toBe(0);
        expect(data.kpis.caEncaisseDeltaPct).toBeNull();
        expect(data.kpis.enAttenteCents).toBe(0);
        for (const m of data.monthlyRevenue) {
          expect(m.paidCents).toBe(0);
          expect(m.pendingCents).toBe(0);
        }
        // B est « free » : blocs Premium null (ni calculés ni renvoyés).
        expect(data.premium.clientRevenueBreakdown).toBeNull();
        expect(data.premium.paymentDelaysByClient).toBeNull();
        const blob = JSON.stringify(data);
        expect(blob).not.toContain(clientAName);
        expect(blob).not.toContain("80000");
      }

      // Réciproque : A retrouve bien SES données après les appels de B (le
      // mock de session est bien la seule chose qui change).
      activeUserId = userA.id;
      const dataA = await getDashboardData("mois");
      expect(dataA.kpis.caEncaisseCents).toBe(80_000);
    }, 60_000);
  });
}
