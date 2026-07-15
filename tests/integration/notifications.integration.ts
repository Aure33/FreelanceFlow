// Vérification réelle de getNotifications() / markNotificationsRead() (#69)
// contre une base réelle. Même patron que dashboard-data.integration.ts :
// mock de la session AVANT import dynamique, vrais users Auth A/B, nettoyage
// exhaustif en afterAll. `next/headers` est mocké par un magasin de cookies en
// mémoire (le contexte requête HTTP est absent sous bun test) — ce qui permet
// de tester le calcul « lu / non lu » ET l'isolation `where userId`.
//
// SÉCURITÉ prouvée ici : B ne voit JAMAIS les pièces de A (et inversement). Si
// le filtre `userId` sautait, l'assertion d'isolation basculerait au rouge.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 30_000;
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
  describe.skip("Notifications — getNotifications (#69)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import de l'action --------
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));

  // Magasin de cookies en mémoire (get/set) pour piloter l'état « lu ».
  const cookieStore = new Map<string, string>();
  mock.module("next/headers", () => ({
    cookies: () => ({
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        cookieStore.set(name, value);
      },
    }),
  }));

  const { getNotifications, markNotificationsRead } = await import(
    "@/app/(app)/notifications"
  );

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-notif-${RUN_ID}-Aa1!`;
  const READ_COOKIE = "ff-notifs-read-at";

  async function createRealUser(slug: string) {
    const email = `test-notif-${slug}-${RUN_ID}@freelanceflow.test`;
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

  async function makeProject(userId: string, label: string) {
    const client = await prisma.client.create({
      data: { userId, name: `Client notif ${label} ${RUN_ID}` },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet ${label} ${RUN_ID}` },
      select: { id: true },
    });
    return project.id;
  }

  const now = Date.now();

  describe("Notifications — getNotifications (#69)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let projectA = "";
    let projectB = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 500));
      projectA = await makeProject(userA.id, "A");
      projectB = await makeProject(userB.id, "B");

      // --- Données de A : 2 notifiables + 5 leurres (ne doivent PAS notifier).
      await prisma.document.createMany({
        data: [
          // ✓ facture en retard (envoye, non payée, échue de 10 j)
          {
            userId: userA.id, projectId: projectA, type: "facture",
            number: `FAC-${RUN_ID}-RETARD`, status: "envoye",
            totalHtCents: 100000, totalTvaCents: 20000, totalTtcCents: 120000,
            emittedAt: new Date(now - 40 * DAY), issuedAt: new Date(now - 40 * DAY),
            dueAt: new Date(now - 10 * DAY),
          },
          // ✓ devis à relancer (envoye, émis il y a 12 j > seuil 7 j)
          {
            userId: userA.id, projectId: projectA, type: "devis",
            number: `DEV-${RUN_ID}-STALE`, status: "envoye",
            totalHtCents: 50000, totalTvaCents: 10000, totalTtcCents: 60000,
            emittedAt: new Date(now - 12 * DAY), issuedAt: new Date(now - 12 * DAY),
          },
          // ✗ devis récent (envoye mais émis il y a 3 j < seuil)
          {
            userId: userA.id, projectId: projectA, type: "devis",
            number: `DEV-${RUN_ID}-RECENT`, status: "envoye",
            totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000,
            emittedAt: new Date(now - 3 * DAY), issuedAt: new Date(now - 3 * DAY),
          },
          // ✗ facture PAYÉE (paidAt posé) — plus une notification
          {
            userId: userA.id, projectId: projectA, type: "facture",
            number: `FAC-${RUN_ID}-PAYE`, status: "paye",
            totalHtCents: 30000, totalTvaCents: 6000, totalTtcCents: 36000,
            emittedAt: new Date(now - 20 * DAY), issuedAt: new Date(now - 20 * DAY),
            dueAt: new Date(now - 10 * DAY), paidAt: new Date(now - 2 * DAY),
          },
          // ✗ facture NON échue (dueAt dans le futur)
          {
            userId: userA.id, projectId: projectA, type: "facture",
            number: `FAC-${RUN_ID}-FUTUR`, status: "envoye",
            totalHtCents: 40000, totalTvaCents: 8000, totalTtcCents: 48000,
            emittedAt: new Date(now - 5 * DAY), issuedAt: new Date(now - 5 * DAY),
            dueAt: new Date(now + 10 * DAY),
          },
          // ✗ devis ACCEPTÉ (statut != envoye)
          {
            userId: userA.id, projectId: projectA, type: "devis",
            number: `DEV-${RUN_ID}-ACC`, status: "accepte",
            totalHtCents: 70000, totalTvaCents: 14000, totalTtcCents: 84000,
            emittedAt: new Date(now - 30 * DAY), issuedAt: new Date(now - 30 * DAY),
          },
          // ✗ brouillon
          {
            userId: userA.id, projectId: projectA, type: "facture",
            status: "brouillon", totalHtCents: 0, totalTvaCents: 0, totalTtcCents: 0,
          },
        ],
      });

      // --- Données de B : 1 facture en retard (cible d'isolation).
      await prisma.document.create({
        data: {
          userId: userB.id, projectId: projectB, type: "facture",
          number: `FAC-${RUN_ID}-B`, status: "envoye",
          totalHtCents: 90000, totalTvaCents: 18000, totalTtcCents: 108000,
          emittedAt: new Date(now - 30 * DAY), issuedAt: new Date(now - 30 * DAY),
          dueAt: new Date(now - 5 * DAY),
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

    test(
      "seulement les pièces notifiables (retard + relance), leurres exclus",
      async () => {
        activeUserId = userA.id;
        cookieStore.clear(); // aucun « lu » → tout non lu
        const { items, unreadCount } = await getNotifications();

        // Exactement 2 items : la facture en retard + le devis à relancer.
        expect(items.length).toBe(2);
        const numbers = items.map((i) => i.number).sort();
        expect(numbers).toEqual(
          [`DEV-${RUN_ID}-STALE`, `FAC-${RUN_ID}-RETARD`].sort(),
        );

        const facture = items.find((i) => i.kind === "facture_retard")!;
        const devis = items.find((i) => i.kind === "devis_relance")!;
        expect(facture.number).toBe(`FAC-${RUN_ID}-RETARD`);
        expect(facture.href).toBe(`/factures/${facture.id}`);
        expect(facture.amountTtcCents).toBe(120000); // TTC, centimes exacts
        expect(facture.days).toBeGreaterThanOrEqual(9);
        expect(devis.number).toBe(`DEV-${RUN_ID}-STALE`);
        expect(devis.href).toBe(`/devis/${devis.id}`);
        expect(devis.amountTtcCents).toBe(60000);

        // Aucun leurre ne s'est glissé.
        for (const bad of ["RECENT", "PAYE", "FUTUR", "ACC"]) {
          expect(numbers.some((n) => n.includes(bad))).toBe(false);
        }

        // Tout non lu par défaut.
        expect(unreadCount).toBe(2);
        expect(items.every((i) => i.unread)).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "isolation A/B : chacun ne voit que ses propres pièces",
      async () => {
        cookieStore.clear();

        activeUserId = userA.id;
        const a = await getNotifications();
        expect(a.items.some((i) => i.number === `FAC-${RUN_ID}-B`)).toBe(false);

        activeUserId = userB.id;
        const b = await getNotifications();
        expect(b.items.length).toBe(1);
        expect(b.items[0].number).toBe(`FAC-${RUN_ID}-B`);
        // Aucune pièce de A ne fuit chez B.
        expect(
          b.items.some((i) => i.number.startsWith(`FAC-${RUN_ID}-`) && i.number.endsWith("RETARD")),
        ).toBe(false);
      },
      TIMEOUT,
    );

    test(
      "« tout marquer comme lu » : unreadCount tombe à 0, items conservés",
      async () => {
        activeUserId = userA.id;
        cookieStore.clear();

        const before = await getNotifications();
        expect(before.unreadCount).toBe(2);

        await markNotificationsRead(); // pose ff-notifs-read-at = maintenant
        expect(cookieStore.get(READ_COOKIE)).toBeDefined();

        const after = await getNotifications();
        expect(after.items.length).toBe(2); // les pièces restent affichées
        expect(after.unreadCount).toBe(0); // mais plus aucune « non lue »
        expect(after.items.every((i) => !i.unread)).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "un « lu » antérieur aux événements laisse les items non lus",
      async () => {
        activeUserId = userA.id;
        // Lu il y a 100 jours → bien AVANT que les pièces ne deviennent
        // notifiables → elles restent non lues.
        cookieStore.set(READ_COOKIE, String(now - 100 * DAY));
        const { unreadCount, items } = await getNotifications();
        expect(unreadCount).toBe(2);
        expect(items.every((i) => i.unread)).toBe(true);
      },
      TIMEOUT,
    );
  });
}
