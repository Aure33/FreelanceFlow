// -----------------------------------------------------------------------------
// Garde de sécurité + exactitude des calculs de la page /rapports (issue #11).
//
// C'est le cœur métier de l'issue : `getReportsData()` (app/(app)/rapports/
// actions.ts) doit (1) ne JAMAIS calculer ni renvoyer les 2 blocs Premium
// (répartition CA par client, délais de paiement par client) pour un compte
// "free" — le flou CSS de la maquette n'est pas une barrière de sécurité
// réelle, la vraie garde est côté serveur — et (2) produire des KPI / un
// graphe mensuel exacts au centime et au jour près, jamais un NaN ou une
// division par zéro silencieuse sur les cas de bord (aucune facture payée,
// aucun devis décidé).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright (tests/e2e/) :
// `getReportsData()` est une simple fonction serveur (Prisma + agrégations),
// sans autre dépendance au contexte HTTP que `requireUserId()`. On l'appelle
// ICI directement, en mockant seulement cette fonction (bun:test
// `mock.module`, AVANT tout import dynamique du module d'actions — un import
// statique serait hoisté par le moteur JS avant le mock et appellerait la
// vraie session). Vraie authentification Supabase, vraie base Prisma, aucun
// mock du code testé lui-même — même pattern que
// tests/integration/paywall-quota.integration.ts.
//
// EXTENSION : `.integration.ts`, pas `.test.ts` — `bun test` sans argument ne
// découvre donc jamais ce fichier (voir bunfig.toml). Lancé explicitement via
// `bun run test:integration`.
//
// ENV : `bun test` ne charge pas .env.local automatiquement — on le lit
// nous-mêmes ci-dessous (best-effort, jamais d'écrasement d'une variable déjà
// présente, ex. secrets CI). Si absents, la suite est SKIPPÉE proprement.
// Projet Supabase = celui de .env.local (dev, faute de projet de TEST dédié
// tant que #17 n'a pas séparé dev/prod — jamais la prod réelle). Tous les
// utilisateurs/données créés sont nettoyés en afterAll, y compris en cas
// d'échec d'un test.
//
// DÉTERMINISME DES DATES (important) : `getReportsData()` lit l'horloge
// réelle (`new Date()`, non mockée) pour déterminer l'année en cours et la
// borne "à date" de l'année précédente (même jour calendaire l'an dernier,
// utilisée UNIQUEMENT pour le delta de CA encaissé). Pour que ce test soit
// reproductible QUELLE QUE SOIT la date réelle d'exécution, toutes les
// données "année précédente" sont datées du 1er janvier — le 1er jour de
// l'année est TOUJOURS antérieur ou égal à "aujourd'hui" quel que soit le
// jour réel d'exécution, donc TOUJOURS inclus dans la borne "à date". Aucune
// donnée de test ne dépend d'une comparaison avec la date réelle du jour.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReportsData } from "@/app/(app)/rapports/actions";

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
  describe.skip("Rapports — KPI, graphe mensuel et garde Premium (#11)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mock du contexte requête HTTP, AVANT tout import des actions ---------
  // `activeUserId` est mutée entre les tests pour rejouer getReportsData() "en
  // tant que" A, B ou Edge — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  // Import DYNAMIQUE (après le mock : un import statique serait hoisté avant
  // mock.module par le moteur JS et capterait la vraie session).
  const { getReportsData } = await import("@/app/(app)/rapports/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-rapports-${RUN_ID}-Aa1!`;

  const now = new Date();
  const YEAR = now.getUTCFullYear();
  const PREV_YEAR = YEAR - 1;
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

  async function createRealUser(slug: string) {
    const email = `test-rapports-${slug}-${RUN_ID}@freelanceflow.test`;
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

  async function createClientAndProject(
    userId: string,
    label: string,
  ): Promise<{ clientId: string; projectId: string }> {
    const client = await prisma.client.create({
      data: { userId, name: `Client rapports ${label} ${RUN_ID}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet rapports ${label} ${RUN_ID}` },
      select: { id: true },
    });
    return { clientId: client.id, projectId: project.id };
  }

  type DocSpec = {
    projectId: string;
    type: "facture" | "devis";
    status: "brouillon" | "envoye" | "accepte" | "refuse" | "paye";
    totalHtCents: number;
    issuedAt: Date;
    paidAt?: Date;
  };

  async function createDoc(userId: string, spec: DocSpec) {
    await prisma.document.create({
      data: {
        userId,
        projectId: spec.projectId,
        type: spec.type,
        status: spec.status,
        totalHtCents: spec.totalHtCents,
        totalTvaCents: 0,
        totalTtcCents: spec.totalHtCents,
        issuedAt: spec.issuedAt,
        paidAt: spec.paidAt ?? null,
      },
    });
  }

  describe("Rapports — KPI, graphe mensuel et garde Premium (#11)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let userEdge: { id: string; email: string };
    let projA: Record<string, { clientId: string; projectId: string }>;
    let projB: { clientId: string; projectId: string };

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      userEdge = await createRealUser("edge");

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant d'y référencer un client/projet.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // --- Jeu de données principal : userA, 5 clients ------------------------
      const c1 = await createClientAndProject(userA.id, "C1");
      const c2 = await createClientAndProject(userA.id, "C2");
      const c3 = await createClientAndProject(userA.id, "C3");
      const c4 = await createClientAndProject(userA.id, "C4");
      const c5 = await createClientAndProject(userA.id, "C5");
      projA = { c1, c2, c3, c4, c5 };

      // Factures payées cette année (CA encaissé + délais + breakdown client)
      await createDoc(userA.id, {
        projectId: c1.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 100_000,
        issuedAt: d(YEAR, 0, 5),
        paidAt: d(YEAR, 0, 20), // délai 15j
      });
      await createDoc(userA.id, {
        projectId: c2.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 50_000,
        issuedAt: d(YEAR, 1, 1),
        paidAt: d(YEAR, 1, 11), // délai 10j
      });
      await createDoc(userA.id, {
        projectId: c1.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 30_000,
        issuedAt: d(YEAR, 2, 1),
        paidAt: d(YEAR, 2, 21), // délai 20j
      });
      await createDoc(userA.id, {
        projectId: c3.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 20_000,
        issuedAt: d(YEAR, 3, 1),
        paidAt: d(YEAR, 3, 6), // délai 5j
      });

      // Factures envoyées non payées cette année (en attente)
      await createDoc(userA.id, {
        projectId: c4.projectId,
        type: "facture",
        status: "envoye",
        totalHtCents: 40_000,
        issuedAt: d(YEAR, 4, 5),
      });
      await createDoc(userA.id, {
        projectId: c5.projectId,
        type: "facture",
        status: "envoye",
        totalHtCents: 60_000,
        issuedAt: d(YEAR, 5, 10),
      });

      // Devis décidés cette année (taux d'acceptation + breakdown client)
      await createDoc(userA.id, {
        projectId: c1.projectId,
        type: "devis",
        status: "accepte",
        totalHtCents: 10_000,
        issuedAt: d(YEAR, 0, 10),
      });
      await createDoc(userA.id, {
        projectId: c2.projectId,
        type: "devis",
        status: "accepte",
        totalHtCents: 5_000,
        issuedAt: d(YEAR, 1, 15),
      });
      await createDoc(userA.id, {
        projectId: c3.projectId,
        type: "devis",
        status: "refuse",
        totalHtCents: 7_000,
        issuedAt: d(YEAR, 2, 10),
      });

      // Devis brouillon (jamais décidé, jamais compté nulle part — même dans
      // le breakdown Premium : montant volontairement énorme pour que toute
      // fuite soit flagrante si le filtre `status: { not: "brouillon" }`
      // disparaissait).
      await createDoc(userA.id, {
        projectId: c4.projectId,
        type: "devis",
        status: "brouillon",
        totalHtCents: 999_999,
        issuedAt: d(YEAR, 0, 1),
      });

      // Année précédente — TOUJOURS datée du 1er janvier (voir note d'en-tête
      // sur le déterminisme) : garantit l'inclusion dans la borne "à date"
      // quel que soit le jour réel d'exécution du test.
      await createDoc(userA.id, {
        projectId: c1.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 80_000,
        issuedAt: d(PREV_YEAR, 0, 1), // délai 0j
        paidAt: d(PREV_YEAR, 0, 1),
      });
      await createDoc(userA.id, {
        projectId: c2.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 20_000,
        issuedAt: d(PREV_YEAR - 1, 11, 22), // délai 10j
        paidAt: d(PREV_YEAR, 0, 1),
      });

      // --- Jeu de données isolation : userB ------------------------------------
      projB = await createClientAndProject(userB.id, "B1");
      await createDoc(userB.id, {
        projectId: projB.projectId,
        type: "facture",
        status: "paye",
        totalHtCents: 999_900,
        issuedAt: d(YEAR, 0, 1),
        paidAt: d(YEAR, 0, 1),
      });

      // --- userEdge : aucun document du tout (cas de bord) ---------------------
    }, 60_000);

    afterAll(async () => {
      // Nettoyage — toujours exécuté, même si un test a échoué en cours de
      // route. Ordre imposé par les contraintes RESTRICT du schéma.
      const users = [userA, userB, userEdge];
      for (const u of users) {
        try {
          if (u?.id) await prisma.document.deleteMany({ where: { userId: u.id } });
        } catch (e) {
          console.warn(`Nettoyage documents (${u?.email}) échoué :`, e);
        }
      }
      const allProjects = [...Object.values(projA ?? {}), projB].filter(Boolean);
      for (const p of allProjects) {
        try {
          if (p?.projectId) await prisma.project.delete({ where: { id: p.projectId } });
        } catch (e) {
          console.warn("Nettoyage projet échoué :", e);
        }
      }
      for (const p of allProjects) {
        try {
          if (p?.clientId) await prisma.client.delete({ where: { id: p.clientId } });
        } catch (e) {
          console.warn("Nettoyage client échoué :", e);
        }
      }
      await prisma.$disconnect();

      for (const u of users) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression utilisateur (${u?.email}) échouée :`, e);
        }
      }
    }, 30_000);

    test("compte free : KPI + graphe mensuel exacts, blocs Premium NULL (ni calculés, ni renvoyés)", async () => {
      activeUserId = userA.id;
      const data: ReportsData = await getReportsData();

      expect(data.year).toBe(YEAR);

      // --- KPI 1 : CA encaissé + delta -----------------------------------------
      expect(data.kpis.caEncaisseCents).toBe(200_000);
      // (200000 - 100000) / 100000 * 100 = 100%
      expect(data.kpis.caEncaisseDeltaPct).toBe(100);

      // --- KPI 2 : en attente ----------------------------------------------------
      expect(data.kpis.enAttenteCents).toBe(100_000);
      expect(data.kpis.enAttenteCount).toBe(2);

      // --- KPI 3 : délai moyen de paiement + delta -------------------------------
      // délais cette année : 15, 10, 20, 5 -> moyenne 12.5 -> arrondi 13
      expect(data.kpis.delaiMoyenPaiementJours).toBe(13);
      // délais l'an dernier : 0, 10 -> moyenne 5 -> arrondi 5 ; delta 13-5=8
      expect(data.kpis.delaiMoyenPaiementDeltaJours).toBe(8);

      // --- KPI 4 : taux d'acceptation des devis -----------------------------------
      expect(data.kpis.devisAcceptesCount).toBe(2);
      expect(data.kpis.devisDecidesCount).toBe(3);
      // round(2/3 * 100) = round(66.66..) = 67 — le devis brouillon n'est PAS compté
      expect(data.kpis.tauxAcceptationDevisPct).toBe(67);

      // --- Graphe CA mensuel -------------------------------------------------------
      expect(data.monthlyRevenue).toHaveLength(12);
      const byMonth = Object.fromEntries(
        data.monthlyRevenue.map((m) => [m.month, m]),
      );
      expect(byMonth["Jan"]).toEqual({ month: "Jan", paidCents: 100_000, pendingCents: 0 });
      expect(byMonth["Fév"]).toEqual({ month: "Fév", paidCents: 50_000, pendingCents: 0 });
      expect(byMonth["Mar"]).toEqual({ month: "Mar", paidCents: 30_000, pendingCents: 0 });
      expect(byMonth["Avr"]).toEqual({ month: "Avr", paidCents: 20_000, pendingCents: 0 });
      expect(byMonth["Mai"]).toEqual({ month: "Mai", paidCents: 0, pendingCents: 40_000 });
      expect(byMonth["Juin"]).toEqual({ month: "Juin", paidCents: 0, pendingCents: 60_000 });
      // Le reste de l'année : rigoureusement à zéro (aucune fuite d'un autre mois)
      for (const label of ["Juil", "Août", "Sep", "Oct", "Nov", "Déc"]) {
        expect(byMonth[label]).toEqual({ month: label, paidCents: 0, pendingCents: 0 });
      }
      // Cohérence interne : la somme des mois doit retomber sur les KPI 1 et 2
      const sumPaid = data.monthlyRevenue.reduce((s, m) => s + m.paidCents, 0);
      const sumPending = data.monthlyRevenue.reduce((s, m) => s + m.pendingCents, 0);
      expect(sumPaid).toBe(data.kpis.caEncaisseCents);
      expect(sumPending).toBe(data.kpis.enAttenteCents);

      // --- GARDE DE SÉCURITÉ : compte free -> blocs Premium NULL -------------------
      expect(data.premium.clientRevenueBreakdown).toBeNull();
      expect(data.premium.paymentDelaysByClient).toBeNull();
    }, 15_000);

    test("bascule premium : blocs Premium remplis avec les vraies données (top clients triés, autres, moyenne)", async () => {
      await prisma.user.update({
        where: { id: userA.id },
        data: { planType: "premium" },
      });

      activeUserId = userA.id;
      const data: ReportsData = await getReportsData();

      // Les KPI/graphe ne changent pas avec le plan
      expect(data.kpis.caEncaisseCents).toBe(200_000);
      expect(data.kpis.delaiMoyenPaiementJours).toBe(13);

      // --- Répartition du CA par client (devis + factures émis, hors brouillon) --
      const breakdown = data.premium.clientRevenueBreakdown;
      expect(breakdown).not.toBeNull();
      // C1 = 100000+30000+10000 = 140000 ; C5 = 60000 ; C2 = 50000+5000 = 55000 ;
      // C4 = 40000 ; C3 = 20000+7000 = 27000 (le brouillon C4 999999 est exclu)
      expect(breakdown!.items).toEqual([
        { clientName: `Client rapports C1 ${RUN_ID}`, cents: 140_000 },
        { clientName: `Client rapports C5 ${RUN_ID}`, cents: 60_000 },
        { clientName: `Client rapports C2 ${RUN_ID}`, cents: 55_000 },
        { clientName: `Client rapports C4 ${RUN_ID}`, cents: 40_000 },
      ]);
      expect(breakdown!.othersCents).toBe(27_000); // C3, seul client restant après le top 4
      // Cohérence : total du breakdown = tout ce qui a été émis (hors brouillon) cette année
      const breakdownTotal =
        breakdown!.items.reduce((s, i) => s + i.cents, 0) + breakdown!.othersCents;
      expect(breakdownTotal).toBe(140_000 + 60_000 + 55_000 + 40_000 + 27_000);

      // --- Délais de paiement par client (factures payées cette année) -----------
      const delays = data.premium.paymentDelaysByClient;
      expect(delays).not.toBeNull();
      // C3 : [5] -> 5 ; C2 : [10] -> 10 ; C1 : [15,20] -> moyenne 17.5 -> arrondi 18
      expect(delays!.items).toEqual([
        { clientName: `Client rapports C3 ${RUN_ID}`, days: 5 },
        { clientName: `Client rapports C2 ${RUN_ID}`, days: 10 },
        { clientName: `Client rapports C1 ${RUN_ID}`, days: 18 },
      ]);
      // Moyenne globale réutilisée telle quelle depuis le KPI 3 (même jeu de données)
      expect(delays!.averageDays).toBe(13);
    }, 15_000);

    test("cas de bord : aucune facture payée et aucun devis décidé cette année -> pas de NaN, pas de division par zéro", async () => {
      activeUserId = userEdge.id;
      const data: ReportsData = await getReportsData();

      expect(data.kpis.caEncaisseCents).toBe(0);
      // Rien à comparer l'an dernier non plus (0 des deux côtés) -> null, pas 0/0=NaN
      expect(data.kpis.caEncaisseDeltaPct).toBeNull();
      expect(data.kpis.enAttenteCents).toBe(0);
      expect(data.kpis.enAttenteCount).toBe(0);
      // Aucune facture payée -> null, jamais 0 ni NaN
      expect(data.kpis.delaiMoyenPaiementJours).toBeNull();
      expect(data.kpis.delaiMoyenPaiementDeltaJours).toBeNull();
      // Aucun devis décidé -> 0, jamais NaN (division par zéro évitée)
      expect(data.kpis.devisDecidesCount).toBe(0);
      expect(data.kpis.tauxAcceptationDevisPct).toBe(0);
      expect(Number.isNaN(data.kpis.tauxAcceptationDevisPct)).toBe(false);

      for (const m of data.monthlyRevenue) {
        expect(m.paidCents).toBe(0);
        expect(m.pendingCents).toBe(0);
      }

      // Compte free (défaut à la création) -> blocs Premium NULL également
      expect(data.premium.clientRevenueBreakdown).toBeNull();
      expect(data.premium.paymentDelaysByClient).toBeNull();
    }, 15_000);

    test(
      "isolation : les données de B n'apparaissent jamais dans le rapport de A, et inversement (where: { userId })",
      async () => {
        // B n'a qu'une seule facture payée (999900) cette année : si le filtre
        // userId disparaissait d'une des requêtes de getReportsData(), le CA de
        // A (200000) ou de B se retrouverait pollué par les données de l'autre.
        activeUserId = userB.id;
        const dataB: ReportsData = await getReportsData();
        expect(dataB.kpis.caEncaisseCents).toBe(999_900);
        expect(dataB.kpis.enAttenteCents).toBe(0);
        expect(dataB.kpis.devisDecidesCount).toBe(0);

        // Rejoue A (déjà passé premium au test précédent) : ses totaux doivent
        // rester EXACTEMENT ceux calculés à la main plus haut, sans aucune trace
        // du montant distinctif de B (999900).
        activeUserId = userA.id;
        const dataA: ReportsData = await getReportsData();
        expect(dataA.kpis.caEncaisseCents).toBe(200_000);
        expect(dataA.kpis.caEncaisseCents).not.toBe(200_000 + 999_900);
        expect(
          dataA.premium.clientRevenueBreakdown!.items.some((i) => i.cents === 999_900),
        ).toBe(false);
      },
      30_000,
    );
  });
}
