// Envoi d'un document par e-mail (issue #83) contre une base réelle. Le rendu
// PDF (Puppeteer, lent/lourd) et l'envoi Resend (réseau, quota) sont MOCKÉS —
// cette suite vérifie l'ORCHESTRATION (auth, appartenance, validation,
// persistance de emailSentAt), pas Puppeteer ni Resend eux-mêmes (couverts par
// une vérification manuelle réelle, cf. PR #83 — un envoi effectif a été
// confirmé reçu avec le PDF en pièce jointe).
//
// `sendDocumentByEmailCore` est appelée DIRECTEMENT (pas `sendDocumentByEmail`)
// pour éviter de mocker next/headers, dont d'autres fichiers de ce dossier
// (notifications.integration.ts) fournissent un mock INCOMPATIBLE (sans
// `headers()`) — cf. la fuite globale de mock.module documentée en #68. Le
// contexte origin/cookie est un simple objet ici, sans lien avec next/headers.

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
  describe.skip("Envoi de document par e-mail (#83)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));

  // PDF factice instantané — la génération réelle (Puppeteer) est hors
  // périmètre de cette suite (lente, déjà couverte par les tests #9).
  mock.module("@/lib/pdf", () => ({
    renderDocumentPdf: async () => Buffer.from("fake-pdf-bytes"),
  }));

  // Resend mocké : `mockSendResult` piloté par chaque test, `lastSendCall`
  // capture le payload pour assertions (destinataire, pièce jointe...).
  let mockSendResult: { data: unknown; error: { message: string } | null } = {
    data: { id: "mock" },
    error: null,
  };
  let lastSendCall: Record<string, unknown> | null = null;
  mock.module("resend", () => ({
    Resend: class {
      emails = {
        send: async (payload: Record<string, unknown>) => {
          lastSendCall = payload;
          return mockSendResult;
        },
      };
    },
  }));

  const { sendDocumentByEmailCore } = await import(
    "@/app/(app)/documents/email-actions"
  );

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-mail-${RUN}-Aa1!`;
  const CTX = { origin: "http://localhost:3199", cookieHeader: "sb-test=fake" };

  async function createRealUser(slug: string) {
    const email = `test-mail-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  async function seedDocument(
    userId: string,
    status: string,
    clientEmail: string | null = "client@exemple.fr",
  ): Promise<string> {
    const client = await prisma.client.create({
      data: { userId, name: `Client ${RUN}`, email: clientEmail },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: { userId, clientId: client.id, name: `Projet ${RUN}` },
      select: { id: true },
    });
    const uniq = randomUUID().slice(0, 8);
    const doc = await prisma.document.create({
      data: {
        userId,
        projectId: project.id,
        type: "facture",
        status,
        object: "Prestation de test",
        number: status === "brouillon" ? null : `FAC-${RUN}-${uniq}`,
        totalHtCents: 100000,
        totalTvaCents: 20000,
        totalTtcCents: 120000,
        issuedAt: new Date(),
        emittedAt: status === "brouillon" ? null : new Date(),
      },
      select: { id: true },
    });
    return doc.id;
  }

  describe("Envoi de document par e-mail (#83)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");
      await new Promise((r) => setTimeout(r, 500));
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

    test("brouillon refusé, aucun envoi tenté", async () => {
      activeUserId = userA.id;
      lastSendCall = null;
      const draft = await seedDocument(userA.id, "brouillon");

      const res = await sendDocumentByEmailCore(
        draft,
        { to: "client@exemple.fr" },
        CTX,
      );
      expect(res).toEqual({
        error: "Émettez le document avant de l'envoyer par e-mail.",
      });
      expect(lastSendCall).toBeNull();
    }, TIMEOUT);

    test("adresse invalide rejetée par zod, aucun envoi tenté", async () => {
      activeUserId = userA.id;
      lastSendCall = null;
      const doc = await seedDocument(userA.id, "envoye");

      const res = await sendDocumentByEmailCore(doc, { to: "pas-un-email" }, CTX);
      expect("error" in res).toBe(true);
      expect(lastSendCall).toBeNull();
    }, TIMEOUT);

    test("isolation : B ne peut pas envoyer le document de A", async () => {
      activeUserId = userA.id;
      const docA = await seedDocument(userA.id, "envoye");

      activeUserId = userB.id;
      lastSendCall = null;
      const res = await sendDocumentByEmailCore(
        docA,
        { to: "client@exemple.fr" },
        CTX,
      );
      expect(res).toEqual({ error: "Document introuvable." });
      expect(lastSendCall).toBeNull();

      const row = await prisma.document.findUnique({
        where: { id: docA },
        select: { emailSentAt: true },
      });
      expect(row?.emailSentAt).toBeNull();
    }, TIMEOUT);

    test("succès : PDF joint, Resend appelé, emailSentAt persisté", async () => {
      activeUserId = userA.id;
      mockSendResult = { data: { id: "sent" }, error: null };
      lastSendCall = null;
      const doc = await seedDocument(userA.id, "envoye");

      const res = await sendDocumentByEmailCore(
        doc,
        { to: "destinataire@exemple.fr" },
        CTX,
      );
      expect(res).toEqual({ ok: true, sentAt: expect.any(Date) });

      expect(lastSendCall).not.toBeNull();
      expect(lastSendCall!.to).toBe("destinataire@exemple.fr");
      expect(lastSendCall!.from).toBe("Freelance Flow <onboarding@resend.dev>");
      const attachments = lastSendCall!.attachments as Array<{
        filename: string;
        content: Buffer;
      }>;
      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename.endsWith(".pdf")).toBe(true);
      expect(Buffer.isBuffer(attachments[0].content)).toBe(true);

      const row = await prisma.document.findUnique({
        where: { id: doc },
        select: { emailSentAt: true },
      });
      expect(row?.emailSentAt).not.toBeNull();
    }, TIMEOUT);

    test("échec Resend générique -> erreur FR neutre, rien persisté", async () => {
      activeUserId = userA.id;
      mockSendResult = { data: null, error: { message: "Internal error" } };
      const doc = await seedDocument(userA.id, "envoye");

      const res = await sendDocumentByEmailCore(
        doc,
        { to: "destinataire@exemple.fr" },
        CTX,
      );
      expect(res).toEqual({
        error: "Impossible d'envoyer l'e-mail. Réessayez dans un instant.",
      });
      const row = await prisma.document.findUnique({
        where: { id: doc },
        select: { emailSentAt: true },
      });
      expect(row?.emailSentAt).toBeNull();
    }, TIMEOUT);

    test("restriction Resend (palier gratuit) traduite en FR", async () => {
      activeUserId = userA.id;
      mockSendResult = {
        data: null,
        error: {
          message:
            "You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain",
        },
      };
      const doc = await seedDocument(userA.id, "envoye");

      const res = await sendDocumentByEmailCore(
        doc,
        { to: "destinataire@exemple.fr" },
        CTX,
      );
      expect(res).toEqual({
        error:
          "Mode démo : sans domaine vérifié, Resend n'autorise l'envoi qu'à l'adresse e-mail du compte Resend du freelance.",
      });
    }, TIMEOUT);
  });
}
