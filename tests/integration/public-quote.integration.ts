// Lien public de devis (issue #85) contre une base réelle. Prouve :
//   - createShareLink : propriétaire seul, devis émis seulement, idempotent ;
//   - getPublicQuote : lecture par jeton, jamais une facture, 404 si invalide ;
//   - respondToQuote : accepte/refuse depuis « envoye » uniquement (atomique) ;
//   - revokeShareLink : coupe l'accès ;
//   - ISOLATION : le jeton de A ne donne accès qu'au devis de A ; B ne peut pas
//     créer/révoquer le lien du devis de A.
//
// Patron habituel : mock session AVANT import dynamique, vrais users A/B.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 45_000;

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
  describe.skip("Lien public de devis (#85)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));

  const {
    createShareLink,
    revokeShareLink,
    getPublicQuote,
    respondToQuote,
  } = await import("@/app/(app)/documents/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-pub-${RUN}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-pub-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    return { id: data.user.id, email };
  }

  async function seedQuote(
    userId: string,
    status: string,
    type = "devis",
  ): Promise<string> {
    const client = await prisma.client.create({
      data: { userId, name: `Client ${RUN}` },
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
        type,
        status,
        number:
          status === "brouillon"
            ? null
            : `${type === "devis" ? "DEV" : "FAC"}-${RUN}-${uniq}`,
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

  describe("Lien public de devis (#85)", () => {
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

    test("createShareLink : brouillon refusé, facture refusée, devis émis OK et idempotent", async () => {
      activeUserId = userA.id;

      const draft = await seedQuote(userA.id, "brouillon");
      expect(await createShareLink(draft)).toEqual({
        error: "Émettez le devis avant de le partager.",
      });

      const facture = await seedQuote(userA.id, "envoye", "facture");
      expect(await createShareLink(facture)).toEqual({
        error: "Seuls les devis peuvent être partagés.",
      });

      const quote = await seedQuote(userA.id, "envoye");
      const res1 = await createShareLink(quote);
      expect("token" in res1 && res1.token.length).toBeGreaterThanOrEqual(16);
      const res2 = await createShareLink(quote);
      // Idempotent : même jeton, pas de régénération.
      expect(res2).toEqual(res1);
    }, TIMEOUT);

    test("getPublicQuote : jeton valide -> devis ; invalide/révoqué -> null", async () => {
      activeUserId = userA.id;
      const quote = await seedQuote(userA.id, "envoye");
      const { token } = (await createShareLink(quote)) as { token: string };

      const view = await getPublicQuote(token);
      expect(view?.id).toBe(quote);
      expect(view?.type).toBe("devis");
      expect(view?.publicToken).toBe(token);

      expect(await getPublicQuote("nimportequoi-court")).toBeNull();
      expect(await getPublicQuote(`${token}xxxxxxxx`)).toBeNull();

      // Révocation -> le jeton ne donne plus accès.
      await revokeShareLink(quote);
      expect(await getPublicQuote(token)).toBeNull();
    }, TIMEOUT);

    test("respondToQuote : accepte depuis envoye, refuse la double réponse", async () => {
      activeUserId = userA.id;
      const quote = await seedQuote(userA.id, "envoye");
      const { token } = (await createShareLink(quote)) as { token: string };

      const ok = await respondToQuote(token, "accept");
      expect(ok).toEqual({ ok: true });
      const after = await prisma.document.findUnique({
        where: { id: quote },
        select: { status: true },
      });
      expect(after?.status).toBe("accepte");

      // Deuxième réponse impossible (n'est plus « envoye »).
      const again = await respondToQuote(token, "refuse");
      expect("error" in again).toBe(true);
      const still = await prisma.document.findUnique({
        where: { id: quote },
        select: { status: true },
      });
      expect(still?.status).toBe("accepte"); // inchangé
    }, TIMEOUT);

    test("respondToQuote : refuse un jeton invalide sans rien muter", async () => {
      const res = await respondToQuote("court", "accept");
      expect(res).toEqual({ error: "Lien invalide." });
    }, TIMEOUT);

    test("isolation : B ne peut ni créer ni révoquer le lien du devis de A", async () => {
      activeUserId = userA.id;
      const quoteA = await seedQuote(userA.id, "envoye");

      // B tente de créer un lien sur le devis de A -> « introuvable » (le filtre
      // userId ne voit pas la pièce de A), aucun jeton posé.
      activeUserId = userB.id;
      const res = await createShareLink(quoteA);
      expect("error" in res).toBe(true);
      const a = await prisma.document.findUnique({
        where: { id: quoteA },
        select: { publicToken: true },
      });
      expect(a?.publicToken).toBeNull();

      // A crée le lien ; B tente de le révoquer -> sans effet (filtre userId).
      activeUserId = userA.id;
      const { token } = (await createShareLink(quoteA)) as { token: string };
      activeUserId = userB.id;
      await revokeShareLink(quoteA);
      // Le lien de A tient toujours.
      activeUserId = userA.id;
      expect((await getPublicQuote(token))?.id).toBe(quoteA);
    }, TIMEOUT);
  });
}
