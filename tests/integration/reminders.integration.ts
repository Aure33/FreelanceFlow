// Relances automatiques (issue #84) contre une base réelle. L'envoi Resend est
// MOCKÉ (réseau/quota) : cette suite vérifie l'ORCHESTRATION du balayage —
// sélection des factures éligibles (et SEULEMENT elles), paliers J+N,
// idempotence quotidienne, persistance reminder_count/last_reminder_at,
// non-traitement des comptes free/désactivés — plus la persistance des
// réglages (updateReminderSettings/getProfile) et l'auth de la route cron.
//
// `runReminderSweep(now)` est appelée avec un `now` EXPLICITE : les attendus
// sont dérivés d'offsets relatifs, stables quel que soit le jour d'exécution.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { formatEuros } from "@/lib/invoicing/money";
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
  describe.skip("Relances automatiques (#84)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));

  // Resend mocké : capture TOUS les payloads (le balayage peut envoyer
  // plusieurs relances par run) ; `mockSendError` force un échec d'envoi.
  let sendCalls: Record<string, unknown>[] = [];
  let mockSendError: { message: string } | null = null;
  mock.module("resend", () => ({
    Resend: class {
      emails = {
        send: async (payload: Record<string, unknown>) => {
          sendCalls.push(payload);
          return mockSendError
            ? { data: null, error: mockSendError }
            : { data: { id: "mock" }, error: null };
        },
      };
    },
  }));

  const { runReminderSweep } = await import("@/lib/reminder-sweep");
  const { updateReminderSettings, getProfile } = await import(
    "@/app/(app)/parametres/actions"
  );
  const { GET: cronGet } = await import("@/app/api/cron/relances/route");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-rel-${RUN}-Aa1!`;

  // `now` de référence du balayage — figé pour toute la suite.
  const NOW = new Date();
  const dueAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

  async function createRealUser(slug: string) {
    const email = `test-rel-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  async function seedInvoice(
    userId: string,
    opts: {
      status?: string;
      type?: string;
      dueAt: Date | null;
      clientEmail?: string | null;
      label: string;
    },
  ): Promise<string> {
    const client = await prisma.client.create({
      data: {
        userId,
        name: `Client ${opts.label} ${RUN}`,
        email: opts.clientEmail === undefined ? `client-${RUN}@exemple.fr` : opts.clientEmail,
      },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet ${opts.label} ${RUN}` },
      select: { id: true },
    });
    const status = opts.status ?? "envoye";
    const doc = await prisma.document.create({
      data: {
        userId,
        projectId: project.id,
        type: opts.type ?? "facture",
        status,
        object: `Relance ${opts.label}`,
        number:
          status === "brouillon" ? null : `${opts.type === "devis" ? "DEV" : "FAC"}-${RUN}-${opts.label}`,
        totalHtCents: 100_000,
        totalTvaCents: 20_000,
        totalTtcCents: 120_000,
        issuedAt: dueAgo(40),
        emittedAt: status === "brouillon" ? null : dueAgo(40),
        dueAt: opts.dueAt,
        paidAt: status === "paye" ? NOW : null,
      },
      select: { id: true },
    });
    return doc.id;
  }

  describe("Relances automatiques (#84)", () => {
    let premium: { id: string; email: string }; // premium + relances actives
    let free: { id: string; email: string }; // free + relances actives (ignoré)
    let disabled: { id: string; email: string }; // premium + relances INACTIVES

    let eligibleId = ""; // facture envoyée échue J-10 (palier J+7 dépassé)

    beforeAll(async () => {
      premium = await createRealUser("prem");
      free = await createRealUser("free");
      disabled = await createRealUser("off");
      await new Promise((r) => setTimeout(r, 500));

      await prisma.user.update({
        where: { id: premium.id },
        data: {
          planType: "premium",
          remindersEnabled: true,
          reminderFirstDays: 7,
          reminderSecondDays: 15,
          reminderFinalDays: 30,
          reminderTone: "neutre",
        },
      });
      await prisma.user.update({
        where: { id: free.id },
        data: { planType: "free", remindersEnabled: true },
      });
      await prisma.user.update({
        where: { id: disabled.id },
        data: { planType: "premium", remindersEnabled: false },
      });

      // Le compte premium : 1 facture éligible + un champ de leurres qui ne
      // doivent JAMAIS être relancés.
      eligibleId = await seedInvoice(premium.id, { label: "elig", dueAt: dueAgo(10) });
      await seedInvoice(premium.id, { label: "payee", status: "paye", dueAt: dueAgo(10) });
      await seedInvoice(premium.id, { label: "nonechue", dueAt: new Date(NOW.getTime() + 5 * DAY) });
      await seedInvoice(premium.id, { label: "troprecent", dueAt: dueAgo(3) }); // < J+7
      await seedInvoice(premium.id, { label: "brouillon", status: "brouillon", dueAt: dueAgo(10) });
      await seedInvoice(premium.id, { label: "devis", type: "devis", dueAt: dueAgo(10) });
      await seedInvoice(premium.id, { label: "sansmail", dueAt: dueAgo(10), clientEmail: null });
      // Comptes non traités, avec des factures qui SERAIENT éligibles.
      await seedInvoice(free.id, { label: "freeelig", dueAt: dueAgo(10) });
      await seedInvoice(disabled.id, { label: "offelig", dueAt: dueAgo(10) });
    }, TIMEOUT);

    afterAll(async () => {
      for (const u of [premium, free, disabled]) {
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

    // Ne garde que les envois adressés aux données de CE run (la base dev est
    // partagée : un autre compte premium résiduel ne doit pas fausser la suite).
    const ourCalls = () =>
      sendCalls.filter((c) => String(c.subject).includes(`-${RUN}-`));

    test("balayage : SEULE la facture éligible est relancée, payload exact, trace persistée", async () => {
      sendCalls = [];
      await runReminderSweep(NOW);

      const calls = ourCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].to).toBe(`client-${RUN}@exemple.fr`);
      expect(calls[0].replyTo).toBe(premium.email);
      expect(calls[0].subject).toBe(`Rappel — facture FAC-${RUN}-elig`);
      // TTC exact — via le même formateur (espace insécable U+202F dans le
      // format fr-FR, un littéral à espace simple ne matcherait pas).
      expect(String(calls[0].html)).toContain(formatEuros(120_000));
      expect(String(calls[0].html)).toContain("échue depuis 10 jours"); // ton neutre

      const row = await prisma.document.findUnique({
        where: { id: eligibleId },
        select: { reminderCount: true, lastReminderAt: true },
      });
      expect(row?.reminderCount).toBe(1);
      expect(row?.lastReminderAt?.getTime()).toBe(NOW.getTime());

      // Aucun leurre touché (y compris chez free/disabled).
      const untouched = await prisma.document.count({
        where: {
          userId: { in: [premium.id, free.id, disabled.id] },
          id: { not: eligibleId },
          reminderCount: { gt: 0 },
        },
      });
      expect(untouched).toBe(0);
    }, TIMEOUT);

    test("idempotence : un second balayage le même jour n'envoie rien", async () => {
      sendCalls = [];
      await runReminderSweep(new Date(NOW.getTime() + 3_600_000)); // +1 h
      expect(ourCalls()).toHaveLength(0);
    }, TIMEOUT);

    test("rattrapage : le lendemain du 2ᵉ palier, la 2ᵉ relance part (une seule par facture)", async () => {
      // À J+16 depuis l'échéance (échue J-10 → +6 jours), le palier J+15 est
      // dépassé et la dernière relance date d'un autre jour → une relance pour
      // « elig ». NB : « troprecent » (échue J-3) atteint alors AUSSI son
      // premier palier (J+9 ≥ 7) — comportement correct, asserté à part.
      sendCalls = [];
      const later = new Date(NOW.getTime() + 6 * DAY);
      await runReminderSweep(later);
      const eligCalls = ourCalls().filter((c) =>
        String(c.subject).endsWith(`-elig`),
      );
      expect(eligCalls).toHaveLength(1);

      const row = await prisma.document.findUnique({
        where: { id: eligibleId },
        select: { reminderCount: true },
      });
      expect(row?.reminderCount).toBe(2);

      // Tous les paliers atteints sont servis (J+30 pas encore) → plus rien
      // le jour suivant, ni pour « elig » ni pour « troprecent ».
      sendCalls = [];
      await runReminderSweep(new Date(later.getTime() + DAY));
      expect(ourCalls()).toHaveLength(0);
    }, TIMEOUT);

    test("échec Resend : compté failed, PAS de trace persistée (retente au prochain run)", async () => {
      // Nouvelle facture éligible dédiée pour ne pas polluer les compteurs.
      const failingId = await seedInvoice(premium.id, { label: "fail", dueAt: dueAgo(8) });
      sendCalls = [];
      mockSendError = { message: "boom" };
      await runReminderSweep(NOW);
      mockSendError = null;

      const row = await prisma.document.findUnique({
        where: { id: failingId },
        select: { reminderCount: true, lastReminderAt: true },
      });
      expect(row?.reminderCount).toBe(0);
      expect(row?.lastReminderAt).toBeNull();

      // Nettoyage : on la marque payée pour la sortir du champ des tests suivants.
      await prisma.document.updateMany({
        where: { id: failingId, userId: premium.id },
        data: { status: "paye" },
      });
    }, TIMEOUT);

    test("updateReminderSettings : persiste des valeurs whitelistées, getProfile les relit", async () => {
      activeUserId = premium.id;
      const res = await updateReminderSettings({
        enabled: true,
        firstDays: 3,
        secondDays: 21,
        finalDays: 45,
        tone: "ferme",
      });
      expect(res).toEqual({ ok: true });

      const profile = await getProfile();
      expect(profile.reminders).toEqual({
        enabled: true,
        firstDays: 3,
        secondDays: 21,
        finalDays: 45,
        tone: "ferme",
      });
    }, TIMEOUT);

    test("updateReminderSettings : valeur forgée hors whitelist refusée", async () => {
      activeUserId = premium.id;
      const res = await updateReminderSettings({
        enabled: true,
        firstDays: 5 as never, // pas dans {3,7,10}
        secondDays: 15,
        finalDays: 30,
        tone: "courtois",
      });
      expect("error" in res).toBe(true);
    }, TIMEOUT);

    test("route cron : 401 sans le bon Bearer, 200 + bilan avec", async () => {
      process.env.CRON_SECRET = `test-cron-${RUN}`;

      const bad = await cronGet(
        new NextRequest("http://localhost:3199/api/cron/relances"),
      );
      expect(bad.status).toBe(401);

      const badToken = await cronGet(
        new NextRequest("http://localhost:3199/api/cron/relances", {
          headers: { authorization: "Bearer mauvais-secret" },
        }),
      );
      expect(badToken.status).toBe(401);

      const ok = await cronGet(
        new NextRequest("http://localhost:3199/api/cron/relances", {
          headers: { authorization: `Bearer test-cron-${RUN}` },
        }),
      );
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(typeof body.sent).toBe("number");
      expect(typeof body.usersProcessed).toBe("number");
    }, TIMEOUT);
  });
}
