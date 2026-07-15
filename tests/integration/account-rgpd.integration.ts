// -----------------------------------------------------------------------------
// Compte : mot de passe / e-mail / suppression RGPD (issue #68) — intégration.
//
// 3 server actions dans app/(app)/parametres/account-actions.ts :
//   changePassword({currentPassword, newPassword}) / changeEmail({newEmail}) /
//   deleteAccount({confirmEmail})
//
// Ce qu'on prouve, avec des utilisateurs Supabase RÉELS (Auth + Prisma réel) :
//   - deleteAccount = le CŒUR RGPD : après l'action, plus AUCUNE ligne du user
//     dans les 5 tables (document_lines, documents, projects, clients, users)
//     + le compte auth.users est supprimé (API admin) + les données d'un
//     AUTRE user sont restées STRICTEMENT intactes (instantané avant/après).
//   - deleteAccount = confirmation FORTE : mauvaise adresse → erreur exacte et
//     zéro suppression ; la bonne adresse avec une casse différente passe
//     (case-insensitive, comme le bouton de la modale côté UI).
//   - changePassword : validation zod (messages FR exacts, échec AVANT tout
//     appel réseau), mauvais mot de passe actuel → « Mot de passe actuel
//     incorrect. » (la re-vérification passe par un client Supabase JETABLE,
//     pas par le client SSR — elle fonctionne donc telle quelle en test),
//     refus d'un nouveau mot de passe identique (branche same_password), et
//     happy path COMPLET : le client SSR est mocké par un client supabase-js
//     porteur de la VRAIE session du user (signInWithPassword), puis on prouve
//     le changement en se reconnectant avec le nouveau mot de passe (et en
//     vérifiant que l'ancien échoue).
//   - changeEmail : validation (adresse vide/invalide, même adresse y compris
//     à la casse près). Le happy path (updateUser({email})) n'est PAS testé
//     ici : il déclenche l'envoi RÉEL de 2 e-mails de confirmation Supabase
//     (« secure email change ») vers des adresses inexistantes — bounces sur
//     le SMTP du projet dev. La synchro finale est prouvée par le test du
//     trigger ci-dessous.
//   - TRIGGER on_auth_user_email_updated (migration 20260715090000) : un
//     UPDATE direct de auth.users.email via l'API admin (= l'état final d'un
//     changement d'e-mail confirmé) est répercuté sur public.users.email
//     (relu via Prisma). Prouve que la migration est bien appliquée sur dev.
//
// MOCKS (contexte requête HTTP uniquement, posés AVANT l'import dynamique) :
//   - @/lib/auth/session : les actions utilisent requireUserId() (comme TOUT
//     le reste du projet) puis lisent l'e-mail sur public.users via Prisma.
//     `activeUserId` est muté entre les tests ; vide -> requireUserId redirige
//     (RedirectSignal, comme le vrai). Mock volontairement identique à celui
//     des autres fichiers d'intégration (requireUserId seul) : aucune fuite de
//     mock partiel entre fichiers dans le même process `bun test`.
//   - @/lib/supabase/server : createClient() (SSR, cookies) est inutilisable
//     hors requête. Remplacé par `currentSsrClient` mutable : un STUB dont
//     updateUser THROW (pour prouver que les tests de validation échouent
//     AVANT le réseau) et signOut est no-op — ou, pour le happy path
//     changePassword, un client supabase-js réel porteur de la session du
//     user de test.
//   - next/navigation : redirect → RedirectSignal (comme deleteClient/#58).
//
// Extension `.integration.ts` (jamais découverte par `bun test` nu — lancée via
// `bun run test:integration`). Secrets lus depuis .env.local, suite SKIPPÉE
// proprement s'ils manquent. ⚠️ Consomme des users Auth du projet DEV : tout
// est nettoyé en afterAll (sauf le user que le test deleteAccount supprime
// lui-même — le nettoyage reste tolérant s'il tourne quand même dessus).

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT = 30_000; // écritures réseau réelles (Supabase Auth + Prisma)

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

// La clé publishable est requise EN PLUS des secrets habituels : changePassword
// construit son client jetable de re-vérification avec elle.
const hasEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_URL;

if (!hasEnv) {
  describe.skip("Compte : mot de passe / e-mail / suppression RGPD (#68)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import des actions --------

  // redirect() (succès de deleteAccount + requireUserId sans session) lève
  // NEXT_REDIRECT en vrai : remplacé par une erreur typée portant le chemin.
  class RedirectSignal extends Error {
    constructor(public path: string) {
      super(`NEXT_REDIRECT ${path}`);
    }
  }
  mock.module("next/navigation", () => ({
    redirect: (path: string) => {
      throw new RedirectSignal(path);
    },
  }));

  // Session : requireUserId (comme tout le projet). `activeUserId` muté entre
  // les tests ; vide -> redirige vers /connexion (comportement réel).
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => {
      if (!activeUserId) throw new RedirectSignal("/connexion");
      return activeUserId;
    },
  }));

  // Client SSR : stub par défaut. updateUser THROW volontairement — si un test
  // de validation atteignait le client SSR, il échouerait BRUYAMMENT au lieu de
  // passer par accident (un test qui ne peut pas échouer ne prouve rien).
  function ssrStub() {
    return {
      auth: {
        updateUser: async () => {
          throw new Error(
            "Client SSR atteint alors que le test ne l'attendait pas.",
          );
        },
        signOut: async () => ({ error: null }),
      },
    };
  }
  let currentSsrClient: unknown = ssrStub();
  mock.module("@/lib/supabase/server", () => ({
    createClient: async () => currentSsrClient,
  }));

  // Import DYNAMIQUE (après les mocks — un import statique serait hoisté).
  const accountActions = await import("@/app/(app)/parametres/account-actions");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const admin = createSupabaseClient(
    SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);

  // Client supabase-js « anonyme » jetable, sans persistance (aucun cookie /
  // storage touché) — pour signInWithPassword de vérification et pour porter
  // la vraie session du happy path changePassword.
  function bareClient() {
    return createSupabaseClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function createRealUser(slug: string, password: string) {
    const email = `test-rgpd-${slug}-${RUN_ID}@freelanceflow.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`Création du user ${slug} a échoué : ${error?.message}`);
    }
    return { id: data.user.id, email };
  }

  // Fixture métier complète pour un user : 1 client, 1 projet, 2 documents
  // (dont 1 brouillon avec 2 lignes) — de quoi peupler les 5 tables.
  async function seedBusinessData(userId: string, tag: string) {
    const client = await prisma.client.create({
      data: {
        userId,
        name: `Client ${tag} ${RUN_ID}`,
        email: `${tag}@fixture.test`,
        paymentTerms: "30 jours",
      },
      select: { id: true },
    });
    const project = await prisma.project.create({
      data: {
        userId,
        clientId: client.id,
        name: `Projet ${tag} ${RUN_ID}`,
      },
      select: { id: true },
    });
    await prisma.document.create({
      data: {
        userId,
        projectId: project.id,
        type: "facture",
        status: "brouillon",
        lines: {
          create: [
            {
              userId,
              label: `Ligne 1 ${tag}`,
              quantity: 1,
              unitPriceCents: 10_000,
              tvaRate: 20,
              position: 0,
            },
            {
              userId,
              label: `Ligne 2 ${tag}`,
              quantity: 2,
              unitPriceCents: 2_550,
              tvaRate: 10,
              position: 1,
            },
          ],
        },
      },
      select: { id: true },
    });
    await prisma.document.create({
      data: {
        userId,
        projectId: project.id,
        type: "devis",
        status: "brouillon",
      },
      select: { id: true },
    });
  }

  // Compte les lignes d'un user dans les 5 tables (vérité base, via Prisma).
  async function countAllTables(userId: string) {
    const [users, clients, projects, documents, documentLines] =
      await Promise.all([
        prisma.user.count({ where: { id: userId } }),
        prisma.client.count({ where: { userId } }),
        prisma.project.count({ where: { userId } }),
        prisma.document.count({ where: { userId } }),
        prisma.documentLine.count({ where: { userId } }),
      ]);
    return { users, clients, projects, documents, documentLines };
  }

  // Instantané COMPLET des données d'un user (toutes colonnes, ordre stable)
  // pour prouver l'intégrité au bit près (isolation).
  async function snapshotAllData(userId: string) {
    const [user, clients, projects, documents, lines] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.client.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      prisma.project.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      prisma.document.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      prisma.documentLine.findMany({
        where: { userId },
        orderBy: { id: "asc" },
      }),
    ]);
    return { user, clients, projects, documents, lines };
  }

  describe("Compte : mot de passe / e-mail / suppression RGPD (#68)", () => {
    // A = user principal (mot de passe, puis supprimé par deleteAccount).
    // B = témoin d'isolation (ses données doivent rester intactes).
    // C = dédié au test du trigger e-mail (son adresse change en cours de
    //     route, on ne le mélange pas aux autres scénarios).
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let userC: { id: string; email: string };
    // Mot de passe COURANT de A — mis à jour quand changePassword réussit.
    let passwordA = `Rgpd-A-${RUN_ID}-1!`;
    const PASSWORD_B = `Rgpd-B-${RUN_ID}-1!`;
    const PASSWORD_C = `Rgpd-C-${RUN_ID}-1!`;

    beforeAll(async () => {
      [userA, userB, userC] = await Promise.all([
        createRealUser("a", passwordA),
        createRealUser("b", PASSWORD_B),
        createRealUser("c", PASSWORD_C),
      ]);
      // Laisse le trigger on_auth_user_created créer les lignes public.users.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await seedBusinessData(userA.id, "a");
      await seedBusinessData(userB.id, "b");
    }, TIMEOUT);

    afterAll(async () => {
      // Nettoyage tolérant — A est normalement déjà supprimé PAR le test
      // deleteAccount lui-même ; on repasse quand même derrière au cas où un
      // échec l'aurait laissé en place. Ordre enfants → parents.
      for (const u of [userA, userB, userC]) {
        try {
          if (u?.id) {
            await prisma.documentLine.deleteMany({ where: { userId: u.id } });
            await prisma.document.deleteMany({ where: { userId: u.id } });
            await prisma.project.deleteMany({ where: { userId: u.id } });
            await prisma.client.deleteMany({ where: { userId: u.id } });
          }
        } catch (e) {
          console.warn(`Nettoyage données (${u?.email}) échoué :`, e);
        }
      }
      await prisma.$disconnect();
      for (const u of [userA, userB, userC]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch {
          // A déjà supprimé par le test = normal ; les autres cas sont logués
          // par Supabase côté serveur, rien d'exploitable ici.
        }
      }
    });

    // ------------------------------------------------------------------------
    // Garde de session commune
    // ------------------------------------------------------------------------
    test("sans session : les 3 actions redirigent vers /connexion (requireUserId)", async () => {
      activeUserId = "";
      currentSsrClient = ssrStub();

      // requireUserId (mocké) lève RedirectSignal("/connexion") comme le vrai
      // redirect() de Next : aucune action ne renvoie de résultat.
      const expectRedirect = async (p: Promise<unknown>) => {
        try {
          const r = await p;
          throw new Error(`devait rediriger mais a renvoyé ${JSON.stringify(r)}`);
        } catch (e) {
          if (!(e instanceof RedirectSignal)) throw e;
          expect(e.path).toBe("/connexion");
        }
      };

      await expectRedirect(
        accountActions.changePassword({
          currentPassword: "x",
          newPassword: "Valide-123",
        }),
      );
      await expectRedirect(accountActions.changeEmail({ newEmail: "a@b.fr" }));
      await expectRedirect(
        accountActions.deleteAccount({ confirmEmail: "a@b.fr" }),
      );
    });

    // ------------------------------------------------------------------------
    // changePassword
    // ------------------------------------------------------------------------
    describe("changePassword", () => {
      test("validation zod : trop court / sans chiffre / actuel vide -> messages exacts, AVANT tout réseau", async () => {
        activeUserId = userA.id;
        // Stub SSR qui THROW : si l'action atteignait updateUser, le test
        // échouerait — preuve que la validation coupe avant le réseau.
        currentSsrClient = ssrStub();

        expect(
          await accountActions.changePassword({
            currentPassword: passwordA,
            newPassword: "Court-7",
          }),
        ).toEqual({
          error: "Le mot de passe doit contenir au moins 8 caractères.",
        });

        expect(
          await accountActions.changePassword({
            currentPassword: passwordA,
            newPassword: "SansChiffre!",
          }),
        ).toEqual({
          error: "Le mot de passe doit contenir au moins un chiffre.",
        });

        expect(
          await accountActions.changePassword({
            currentPassword: "",
            newPassword: "Valide-123",
          }),
        ).toEqual({ error: "Le mot de passe actuel est requis." });
      });

      test(
        "mauvais mot de passe actuel -> « Mot de passe actuel incorrect. » (re-vérification par client jetable)",
        async () => {
          activeUserId = userA.id;
          currentSsrClient = ssrStub(); // l'action doit s'arrêter AVANT le SSR

          expect(
            await accountActions.changePassword({
              currentPassword: `faux-${passwordA}`,
              newPassword: "Nouveau-Valide-123",
            }),
          ).toEqual({ error: "Mot de passe actuel incorrect." });

          // Le mot de passe n'a PAS changé : l'actuel fonctionne toujours.
          const probe = bareClient();
          const { error } = await probe.auth.signInWithPassword({
            email: userA.email,
            password: passwordA,
          });
          expect(error).toBeNull();
        },
        TIMEOUT,
      );

      test(
        "nouveau mot de passe identique à l'actuel -> branche same_password (message FR)",
        async () => {
          activeUserId = userA.id;
          // Client SSR = client supabase-js porteur de la VRAIE session de A.
          const authed = bareClient();
          const { error: signInError } = await authed.auth.signInWithPassword({
            email: userA.email,
            password: passwordA,
          });
          expect(signInError).toBeNull();
          currentSsrClient = authed;

          expect(
            await accountActions.changePassword({
              currentPassword: passwordA,
              newPassword: passwordA,
            }),
          ).toEqual({
            error: "Le nouveau mot de passe doit être différent de l'actuel.",
          });
        },
        TIMEOUT,
      );

      test(
        "happy path : nouveau mot de passe accepté -> reconnexion avec le NOUVEAU ok, l'ANCIEN refusé",
        async () => {
          activeUserId = userA.id;
          const oldPassword = passwordA;
          const newPassword = `Rgpd-A-${RUN_ID}-2!`;

          const authed = bareClient();
          const { error: signInError } = await authed.auth.signInWithPassword({
            email: userA.email,
            password: oldPassword,
          });
          expect(signInError).toBeNull();
          currentSsrClient = authed;

          expect(
            await accountActions.changePassword({
              currentPassword: oldPassword,
              newPassword,
            }),
          ).toEqual({ success: true });

          // Preuve RÉELLE (pas via l'action) : connexions fraîches.
          const probeNew = bareClient();
          const { error: newOk } = await probeNew.auth.signInWithPassword({
            email: userA.email,
            password: newPassword,
          });
          expect(newOk).toBeNull();

          const probeOld = bareClient();
          const { error: oldKo } = await probeOld.auth.signInWithPassword({
            email: userA.email,
            password: oldPassword,
          });
          expect(oldKo).not.toBeNull();

          passwordA = newPassword; // pour la suite (et le nettoyage mental)
        },
        TIMEOUT,
      );
    });

    // ------------------------------------------------------------------------
    // changeEmail — validation (happy path volontairement non testé ici :
    // updateUser({email}) enverrait 2 e-mails de confirmation réels vers des
    // adresses inexistantes ; la synchro finale est prouvée par le trigger).
    // ------------------------------------------------------------------------
    describe("changeEmail — validation", () => {
      test("adresse vide / invalide / identique (même à la casse près) -> messages exacts, AVANT tout réseau", async () => {
        activeUserId = userA.id;
        currentSsrClient = ssrStub(); // updateUser THROW si atteint

        expect(await accountActions.changeEmail({ newEmail: "   " })).toEqual({
          error: "La nouvelle adresse e-mail est requise.",
        });
        expect(
          await accountActions.changeEmail({ newEmail: "pas-un-email" }),
        ).toEqual({ error: "Adresse e-mail invalide." });
        expect(
          await accountActions.changeEmail({ newEmail: userA.email }),
        ).toEqual({ error: "C'est déjà l'adresse de votre compte." });
        // Même adresse en MAJUSCULES : toujours refusée (comparaison
        // case-insensitive — un e-mail n'est pas sensible à la casse).
        expect(
          await accountActions.changeEmail({
            newEmail: userA.email.toUpperCase(),
          }),
        ).toEqual({ error: "C'est déjà l'adresse de votre compte." });
      });
    });

    // ------------------------------------------------------------------------
    // Trigger on_auth_user_email_updated (migration 20260715090000)
    // ------------------------------------------------------------------------
    test(
      "trigger e-mail : UPDATE direct de auth.users.email (API admin) -> public.users.email suit",
      async () => {
        // Sanity : l'adresse initiale de C est bien synchronisée.
        const before = await prisma.user.findUnique({
          where: { id: userC.id },
          select: { email: true },
        });
        expect(before?.email).toBe(userC.email);

        // = l'état final d'un « secure email change » confirmé côté Supabase.
        const newEmail = `test-rgpd-c-nouveau-${RUN_ID}@freelanceflow.test`;
        const { error } = await admin.auth.admin.updateUserById(userC.id, {
          email: newEmail,
          email_confirm: true,
        });
        expect(error).toBeNull();

        // Le trigger est AFTER UPDATE dans la même transaction ; petite marge
        // de retry pour absorber la latence réseau/pool, jamais un faux rouge.
        let synced: string | undefined;
        for (let i = 0; i < 10; i++) {
          const row = await prisma.user.findUnique({
            where: { id: userC.id },
            select: { email: true },
          });
          synced = row?.email;
          if (synced === newEmail) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        expect(synced).toBe(newEmail);
        userC.email = newEmail; // pour un éventuel nettoyage cohérent
      },
      TIMEOUT,
    );

    // ------------------------------------------------------------------------
    // deleteAccount
    // ------------------------------------------------------------------------
    describe("deleteAccount", () => {
      test(
        "confirmation forte : mauvaise adresse -> erreur exacte, AUCUNE donnée supprimée",
        async () => {
          activeUserId = userA.id;
          currentSsrClient = ssrStub();
          const before = await countAllTables(userA.id);
          // Sanity : la fixture est bien en place (le test peut échouer).
          expect(before).toEqual({
            users: 1,
            clients: 1,
            projects: 1,
            documents: 2,
            documentLines: 2,
          });

          expect(
            await accountActions.deleteAccount({
              confirmEmail: `autre-${userA.email}`,
            }),
          ).toEqual({
            error: "L'adresse saisie ne correspond pas à celle du compte.",
          });

          const after = await countAllTables(userA.id);
          expect(after).toEqual(before);
          // Le compte Auth existe toujours.
          const { data } = await admin.auth.admin.getUserById(userA.id);
          expect(data?.user?.id).toBe(userA.id);
        },
        TIMEOUT,
      );

      test(
        "cascade RGPD complète (adresse confirmée en MAJUSCULES = case-insensitive) : 5 tables vidées, auth.users supprimé, user B STRICTEMENT intact",
        async () => {
          // Instantané complet des données de B AVANT — le témoin d'isolation.
          const snapshotB = await snapshotAllData(userB.id);
          expect(snapshotB.user).not.toBeNull(); // sanity
          expect(snapshotB.lines.length).toBeGreaterThan(0); // sanity

          activeUserId = userA.id;
          currentSsrClient = ssrStub(); // signOut no-op suffit ici

          // Adresse EXACTE mais en MAJUSCULES : prouve la comparaison
          // case-insensitive ET la cascade dans le même parcours.
          let redirectedTo: string | undefined;
          try {
            const result = await accountActions.deleteAccount({
              confirmEmail: userA.email.toUpperCase(),
            });
            throw new Error(
              `deleteAccount devait rediriger mais a renvoyé : ${JSON.stringify(result)}`,
            );
          } catch (e) {
            if (!(e instanceof RedirectSignal)) throw e;
            redirectedTo = e.path;
          }
          expect(redirectedTo).toBe("/");

          // 1) Plus AUCUNE ligne de A dans les 5 tables.
          expect(await countAllTables(userA.id)).toEqual({
            users: 0,
            clients: 0,
            projects: 0,
            documents: 0,
            documentLines: 0,
          });

          // 2) Le compte auth.users de A est supprimé (API admin).
          const { data, error } = await admin.auth.admin.getUserById(userA.id);
          expect(data?.user ?? null).toBeNull();
          expect(error).not.toBeNull();

          // 3) Les données de B sont STRICTEMENT identiques à l'instantané.
          const afterB = await snapshotAllData(userB.id);
          expect(afterB).toEqual(snapshotB);
        },
        TIMEOUT,
      );
    });
  });
}
