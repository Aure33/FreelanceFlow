// Logo d'entreprise (issue #87) — isolation d'accès au bucket `logos` contre
// le VRAI Supabase Storage (aucun mock : la barrière testée est la RLS de
// storage.objects posée par la migration 20260718130000).
//
// Deux VRAIS utilisateurs A et B, chacun avec un client Supabase de SESSION
// (clé publishable + signInWithPassword — mêmes droits que le navigateur) :
//   - A écrit/lit/signe dans SON dossier `<A>/...` ;
//   - B ne peut NI écrire dans le dossier de A, NI lire son objet, NI en
//     générer une URL signée ;
//   - un client ANONYME (sans session) ne peut rien lire ;
//   - l'URL signée de A, elle, est lisible publiquement (c'est le mécanisme
//     d'affichage de l'en-tête A4, page publique /proposition comprise) ;
//   - un type de fichier hors whitelist du bucket est refusé par Supabase.

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createClient } from "@supabase/supabase-js";
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
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

// PNG 1×1 valide (entête minimal) — de vrais octets d'image, pas du texte.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

if (!hasEnv) {
  describe.skip("Logo — isolation Storage (#87)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // Server action uploadLogo : requireUserId mocké (pattern commun du dossier,
  // cf. #68). Les cas testés ici (garde Premium, validations) répondent AVANT
  // tout accès au client de session next/headers — le happy path complet
  // (cookies réels) est couvert par l'E2E logo.spec.ts.
  let activeUserId = "";
  const { mock } = await import("bun:test");
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({ revalidatePath: () => {} }));
  const { uploadLogo } = await import("@/app/(app)/parametres/logo-actions");

  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!);
  const prisma = new PrismaClient();
  const RUN = randomUUID().slice(0, 8);
  const PASSWORD = `Test-logo-${RUN}-Aa1!`;

  const sessionOpts = {
    auth: { persistSession: false, autoRefreshToken: false },
  } as const;

  async function createSignedInClient(slug: string) {
    const email = `test-logo-${slug}-${RUN}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`user ${slug} : ${error?.message}`);
    const client = createClient(URL_, ANON, sessionOpts);
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (signInError) throw new Error(`signin ${slug} : ${signInError.message}`);
    return { id: data.user.id, client };
  }

  describe("Logo — isolation Storage (#87)", () => {
    let a: Awaited<ReturnType<typeof createSignedInClient>>;
    let b: Awaited<ReturnType<typeof createSignedInClient>>;
    let pathA = "";

    beforeAll(async () => {
      a = await createSignedInClient("a");
      b = await createSignedInClient("b");
      pathA = `${a.id}/logo.png`;
      await new Promise((r) => setTimeout(r, 500));
    }, TIMEOUT);

    afterAll(async () => {
      await admin.storage
        .from("logos")
        .remove([pathA, `${b.id}/logo.png`])
        .catch(() => {});
      for (const u of [a, b]) {
        if (!u?.id) continue;
        await prisma.user.deleteMany({ where: { id: u.id } });
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
      await prisma.$disconnect();
    }, TIMEOUT);

    test("A écrit dans SON dossier ; B est refusé en écriture dans le dossier de A", async () => {
      const ok = await a.client.storage
        .from("logos")
        .upload(pathA, PNG_1PX, { contentType: "image/png", upsert: true });
      expect(ok.error).toBeNull();

      const hack = await b.client.storage
        .from("logos")
        .upload(`${a.id}/hack.png`, PNG_1PX, { contentType: "image/png" });
      expect(hack.error).not.toBeNull();
    }, TIMEOUT);

    test("B ne peut ni télécharger ni signer l'objet de A ; un client anonyme non plus", async () => {
      const dl = await b.client.storage.from("logos").download(pathA);
      expect(dl.error).not.toBeNull();

      const signed = await b.client.storage
        .from("logos")
        .createSignedUrl(pathA, 60);
      expect(signed.error).not.toBeNull();

      const anon = createClient(URL_, ANON, sessionOpts);
      const anonDl = await anon.storage.from("logos").download(pathA);
      expect(anonDl.error).not.toBeNull();
    }, TIMEOUT);

    test("A télécharge et signe SON objet ; l'URL signée est lisible publiquement (mécanisme d'affichage A4)", async () => {
      const dl = await a.client.storage.from("logos").download(pathA);
      expect(dl.error).toBeNull();
      expect((await dl.data!.arrayBuffer()).byteLength).toBe(PNG_1PX.byteLength);

      const signed = await a.client.storage
        .from("logos")
        .createSignedUrl(pathA, 60);
      expect(signed.error).toBeNull();

      // Fetch SANS aucune clé : c'est ainsi que le navigateur (vue document,
      // page publique /proposition, Puppeteer PDF) charge le logo.
      const res = await fetch(signed.data!.signedUrl);
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBe(PNG_1PX.byteLength);
    }, TIMEOUT);

    test("le bucket refuse un type hors whitelist (même dans son propre dossier)", async () => {
      const bad = await a.client.storage
        .from("logos")
        .upload(`${a.id}/evil.txt`, Buffer.from("pas une image"), {
          contentType: "text/plain",
        });
      expect(bad.error).not.toBeNull();
    }, TIMEOUT);

    test("uploadLogo : garde serveur Premium — un compte free est refusé", async () => {
      activeUserId = a.id; // planType par défaut : free
      const formData = new FormData();
      formData.set("logo", new File([PNG_1PX], "logo.png", { type: "image/png" }));
      expect(await uploadLogo(formData)).toEqual({
        error: "Fonctionnalité réservée au forfait Premium.",
      });
    }, TIMEOUT);

    test("uploadLogo : validations (fichier manquant, type interdit, > 2 Mo)", async () => {
      activeUserId = a.id;
      await prisma.user.update({
        where: { id: a.id },
        data: { planType: "premium" },
      });

      expect(await uploadLogo(new FormData())).toEqual({
        error: "Sélectionnez un fichier image.",
      });

      const gif = new FormData();
      gif.set("logo", new File([PNG_1PX], "logo.gif", { type: "image/gif" }));
      expect(await uploadLogo(gif)).toEqual({
        error: "Format accepté : PNG, SVG ou JPEG.",
      });

      const big = new FormData();
      big.set(
        "logo",
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", {
          type: "image/png",
        }),
      );
      expect(await uploadLogo(big)).toEqual({
        error: "Le fichier dépasse 2 Mo.",
      });
    }, TIMEOUT);
  });
}
