// -----------------------------------------------------------------------------
// Édition & suppression des Clients et Projets (issue #58) — tests d'intégration.
//
// 4 server actions nouvelles :
//   app/(app)/clients/actions.ts : updateClient(id, input) / deleteClient(id)
//   app/(app)/projets/actions.ts : updateProject(id, input) / deleteProject(id)
//
// Ce qu'on prouve, avec DEUX utilisateurs réels (Supabase Auth + Prisma réel) :
//   - VALIDATION zod : entrées invalides rejetées avec le message FR exact,
//     jamais d'écriture partielle ni de détail technique.
//   - ISOLATION (Prisma contourne la RLS) : `updateMany`/`deleteMany` filtrés
//     { id, userId } → l'id d'un autre utilisateur répond « introuvable »
//     (même message qu'un id inexistant : pas d'oracle d'existence) et la
//     donnée d'autrui reste STRICTEMENT inchangée en base (relue et comparée).
//   - GARDES RESTRICT : deleteClient refuse si des projets sont rattachés,
//     deleteProject refuse si des documents sont rattachés (pièces légales).
//   - SUCCÈS : update → undefined + valeurs relues EN BASE (pas via l'action,
//     pour ne pas tester l'action avec elle-même) ; delete → redirect vers la
//     liste + ligne ABSENTE de la base.
//
// Même patron que tests/integration/crud-isolation.integration.ts : mocks du
// seul contexte HTTP (session / revalidatePath / redirect) posés AVANT les
// imports dynamiques des actions ; extension `.integration.ts` (jamais
// découvert par `bun test` nu — lancé via `bun run test:integration`) ; secrets
// lus depuis .env.local, suite SKIPPÉE proprement s'ils manquent ; tout ce qui
// est créé est nettoyé en afterAll même en cas d'échec.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionState } from "@/app/(app)/clients/actions";
import type { ProjectStatus } from "@/app/(app)/projets/actions";

const TIMEOUT = 30_000; // écritures réseau réelles (Supabase + Prisma)

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
  describe.skip("Édition/suppression Clients & Projets (#58)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import des actions --------
  // `activeUserId` est mutée entre les tests pour rejouer les actions "en tant
  // que" A ou B — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));
  // `redirect()` (succès de deleteClient/deleteProject) lève NEXT_REDIRECT en
  // vrai : on le remplace par une erreur typée portant le chemin de destination.
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

  // Import DYNAMIQUE (après les mocks : un import statique serait hoisté avant
  // mock.module par le moteur JS et capterait la vraie session/redirect).
  const clientsActions = await import("@/app/(app)/clients/actions");
  const projetsActions = await import("@/app/(app)/projets/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-edit-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-edit-${slug}-${RUN_ID}@freelanceflow.test`;
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

  // Exécute une action censée réussir en redirigeant (deleteClient /
  // deleteProject) et vérifie le chemin de destination EXACT.
  async function expectRedirect(
    action: () => Promise<ActionState>,
    expectedPath: string,
  ): Promise<void> {
    try {
      const result = await action();
      throw new Error(
        `L'action devait rediriger mais a renvoyé : ${JSON.stringify(result)}`,
      );
    } catch (e) {
      if (e instanceof RedirectSignal) {
        expect(e.path).toBe(expectedPath);
        return;
      }
      throw e;
    }
  }

  // Fixture : un client fraîchement inséré via Prisma (pas via l'action — on
  // ne teste jamais update/delete à travers create).
  function makeClient(userId: string, name: string) {
    return prisma.client.create({
      data: {
        userId,
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}@fixture.test`,
        paymentTerms: "30 jours",
      },
      select: { id: true },
    });
  }

  describe("Édition/suppression Clients & Projets (#58)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    // Données de B ciblées par les tests d'isolation : on en fige un instantané
    // complet pour prouver qu'elles restent inchangées au bit près.
    let clientBId = "";
    let projectBId = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant d'y référencer un client/projet.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const clientB = await prisma.client.create({
        data: {
          userId: userB.id,
          name: `Client secret de B ${RUN_ID}`,
          email: "b@secret.test",
          paymentTerms: "45 jours",
        },
        select: { id: true },
      });
      clientBId = clientB.id;
      const projectB = await prisma.project.create({
        data: {
          userId: userB.id,
          clientId: clientB.id,
          name: `Projet secret de B ${RUN_ID}`,
          notes: "Notes confidentielles de B",
        },
        select: { id: true },
      });
      projectBId = projectB.id;
    }, TIMEOUT);

    afterAll(async () => {
      // Nettoyage — toujours exécuté, même après un échec. Ordre imposé par
      // les contraintes RESTRICT (documents -> projets -> clients -> user).
      for (const u of [userA, userB]) {
        try {
          if (u?.id) {
            await prisma.document.deleteMany({ where: { userId: u.id } });
            await prisma.project.deleteMany({ where: { userId: u.id } });
            await prisma.client.deleteMany({ where: { userId: u.id } });
          }
        } catch (e) {
          console.warn(`Nettoyage données (${u?.email}) échoué :`, e);
        }
      }
      await prisma.$disconnect();
      for (const u of [userA, userB]) {
        try {
          if (u?.id) await admin.auth.admin.deleteUser(u.id);
        } catch (e) {
          console.warn(`Suppression utilisateur (${u?.email}) échouée :`, e);
        }
      }
    });

    // ----------------------------------------------------------------------
    // updateClient
    // ----------------------------------------------------------------------
    describe("clients — updateClient", () => {
      test(
        "succès : A modifie son client (nom, email, paymentTerms) -> undefined, valeurs relues EN BASE",
        async () => {
          activeUserId = userA.id;
          const { id } = await makeClient(userA.id, `A avant edition ${RUN_ID}`);

          const result = await clientsActions.updateClient(id, {
            name: "Studio Beta (édité)",
            email: "nouveau@studio-beta.test",
            paymentTerms: "60 jours",
          });
          expect(result).toBeUndefined();

          // Relecture DIRECTE en base (pas via getClient : on ne vérifie pas
          // l'action avec une autre action).
          const row = await prisma.client.findUnique({
            where: { id },
            select: { name: true, email: true, paymentTerms: true },
          });
          expect(row).toEqual({
            name: "Studio Beta (édité)",
            email: "nouveau@studio-beta.test",
            paymentTerms: "60 jours",
          });
        },
        TIMEOUT,
      );

      test(
        "validation zod : nom vide / SIRET 13 chiffres / email invalide -> messages exacts, base inchangée",
        async () => {
          activeUserId = userA.id;
          const { id } = await makeClient(userA.id, `A validation ${RUN_ID}`);
          const before = await prisma.client.findUnique({ where: { id } });

          expect(
            await clientsActions.updateClient(id, { name: "   " }),
          ).toEqual({ error: "Le nom du client est requis." });

          expect(
            await clientsActions.updateClient(id, {
              name: "Nom valide",
              siret: "1234567890123",
            }),
          ).toEqual({ error: "Le SIRET doit comporter 14 chiffres." });

          expect(
            await clientsActions.updateClient(id, {
              name: "Nom valide",
              email: "pas-un-email",
            }),
          ).toEqual({ error: "Adresse e-mail invalide." });

          // Aucune des trois tentatives ne doit avoir écrit quoi que ce soit.
          const after = await prisma.client.findUnique({ where: { id } });
          expect(after).toEqual(before);
        },
        TIMEOUT,
      );

      test(
        "ISOLATION : A tente updateClient(<client de B>) -> « Client introuvable. » ET le client de B est inchangé",
        async () => {
          const snapshot = await prisma.client.findUnique({
            where: { id: clientBId },
          });
          expect(snapshot).not.toBeNull(); // sanity : la cible existe bien

          activeUserId = userA.id;
          const result = await clientsActions.updateClient(clientBId, {
            name: "PWNED par A",
            email: "pirate@a.test",
          });
          expect(result).toEqual({ error: "Client introuvable." });

          // Relecture intégrale : STRICTEMENT identique à l'instantané.
          const after = await prisma.client.findUnique({
            where: { id: clientBId },
          });
          expect(after).toEqual(snapshot);
        },
        TIMEOUT,
      );

      test("id non-UUID -> « Client introuvable. » proprement (pas d'exception)", async () => {
        activeUserId = userA.id;
        expect(
          await clientsActions.updateClient("pas-un-uuid", { name: "X" }),
        ).toEqual({ error: "Client introuvable." });
        expect(await clientsActions.updateClient("", { name: "X" })).toEqual({
          error: "Client introuvable.",
        });
      });
    });

    // ----------------------------------------------------------------------
    // deleteClient
    // ----------------------------------------------------------------------
    describe("clients — deleteClient", () => {
      test(
        "garde RESTRICT : client de A avec 1 projet -> erreur claire, client TOUJOURS en base",
        async () => {
          activeUserId = userA.id;
          const { id } = await makeClient(userA.id, `A avec projet ${RUN_ID}`);
          await prisma.project.create({
            data: { userId: userA.id, clientId: id, name: `Projet bloquant ${RUN_ID}` },
            select: { id: true },
          });

          const result = await clientsActions.deleteClient(id);
          expect("error" in result).toBe(true);
          expect(result.error).toContain("projet");
          expect(result.error).toContain("supprimez-les d'abord");

          const still = await prisma.client.findUnique({
            where: { id },
            select: { id: true },
          });
          expect(still).not.toBeNull();
        },
        TIMEOUT,
      );

      test(
        "ISOLATION : A tente deleteClient(<client de B>) -> « Client introuvable. », client de B toujours en base",
        async () => {
          activeUserId = userA.id;
          const result = await clientsActions.deleteClient(clientBId);
          expect(result).toEqual({ error: "Client introuvable." });

          const still = await prisma.client.findUnique({
            where: { id: clientBId },
            select: { id: true },
          });
          expect(still).not.toBeNull();
        },
        TIMEOUT,
      );

      test(
        "succès : client de A sans projet -> redirect(/clients), client ABSENT de la base",
        async () => {
          activeUserId = userA.id;
          const { id } = await makeClient(userA.id, `A a supprimer ${RUN_ID}`);

          await expectRedirect(
            () => clientsActions.deleteClient(id),
            "/clients",
          );

          const gone = await prisma.client.findUnique({
            where: { id },
            select: { id: true },
          });
          expect(gone).toBeNull();
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // updateProject
    // ----------------------------------------------------------------------
    describe("projets — updateProject", () => {
      test(
        "succès : A modifie titre + statut (en_cours -> termine) + notes -> undefined, vérifié EN BASE",
        async () => {
          activeUserId = userA.id;
          const client = await makeClient(userA.id, `A pour projet ${RUN_ID}`);
          const project = await prisma.project.create({
            data: {
              userId: userA.id,
              clientId: client.id,
              name: "Projet avant édition",
              // status par défaut : en_cours
            },
            select: { id: true, status: true },
          });
          expect(project.status).toBe("en_cours"); // sanity : point de départ

          const result = await projetsActions.updateProject(project.id, {
            name: "Projet livré (édité)",
            status: "termine",
            notes: "Recette validée le 14/07",
          });
          expect(result).toBeUndefined();

          const row = await prisma.project.findUnique({
            where: { id: project.id },
            select: { name: true, status: true, notes: true },
          });
          expect(row).toEqual({
            name: "Projet livré (édité)",
            status: "termine",
            notes: "Recette validée le 14/07",
          });
        },
        TIMEOUT,
      );

      test("statut invalide (« fini ») -> « Statut invalide. »", async () => {
        activeUserId = userA.id;
        const result = await projetsActions.updateProject(randomUUID(), {
          name: "Projet",
          // Un client (fetch bricolé, extension navigateur…) peut envoyer
          // n'importe quoi : le typage TS ne protège pas le serveur.
          status: "fini" as ProjectStatus,
        });
        expect(result).toEqual({ error: "Statut invalide." });
      });

      test(
        "ISOLATION : A tente updateProject(<projet de B>) -> « Projet introuvable. », projet de B inchangé",
        async () => {
          const snapshot = await prisma.project.findUnique({
            where: { id: projectBId },
          });
          expect(snapshot).not.toBeNull(); // sanity : la cible existe bien

          activeUserId = userA.id;
          const result = await projetsActions.updateProject(projectBId, {
            name: "PWNED par A",
            status: "en_pause",
            notes: "écrasé",
          });
          expect(result).toEqual({ error: "Projet introuvable." });

          const after = await prisma.project.findUnique({
            where: { id: projectBId },
          });
          expect(after).toEqual(snapshot);
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // deleteProject
    // ----------------------------------------------------------------------
    describe("projets — deleteProject", () => {
      test(
        "garde RESTRICT : projet de A avec 1 document (brouillon) -> erreur claire, projet toujours en base",
        async () => {
          activeUserId = userA.id;
          const client = await makeClient(userA.id, `A doc bloquant ${RUN_ID}`);
          const project = await prisma.project.create({
            data: {
              userId: userA.id,
              clientId: client.id,
              name: `Projet avec document ${RUN_ID}`,
            },
            select: { id: true },
          });
          // Document brouillon minimal (jamais émis : number null, totaux 0)
          // avec une ligne — inséré via Prisma, pas via saveDraft (fixture).
          await prisma.document.create({
            data: {
              userId: userA.id,
              projectId: project.id,
              type: "facture",
              status: "brouillon",
              lines: {
                create: [
                  {
                    userId: userA.id,
                    label: "Ligne de test",
                    quantity: 1,
                    unitPriceCents: 0,
                    tvaRate: 20,
                    position: 0,
                  },
                ],
              },
            },
            select: { id: true },
          });

          const result = await projetsActions.deleteProject(project.id);
          expect("error" in result).toBe(true);
          expect(result.error).toContain("document");
          expect(result.error).toContain("ne peut pas être supprimé");

          const still = await prisma.project.findUnique({
            where: { id: project.id },
            select: { id: true },
          });
          expect(still).not.toBeNull();
        },
        TIMEOUT,
      );

      test(
        "ISOLATION : A tente deleteProject(<projet de B>) -> « Projet introuvable. », projet de B toujours en base",
        async () => {
          activeUserId = userA.id;
          const result = await projetsActions.deleteProject(projectBId);
          expect(result).toEqual({ error: "Projet introuvable." });

          const still = await prisma.project.findUnique({
            where: { id: projectBId },
            select: { id: true },
          });
          expect(still).not.toBeNull();
        },
        TIMEOUT,
      );

      test(
        "succès : projet de A sans document -> redirect(/projets), projet ABSENT de la base",
        async () => {
          activeUserId = userA.id;
          const client = await makeClient(userA.id, `A projet jetable ${RUN_ID}`);
          const project = await prisma.project.create({
            data: {
              userId: userA.id,
              clientId: client.id,
              name: `Projet à supprimer ${RUN_ID}`,
            },
            select: { id: true },
          });

          await expectRedirect(
            () => projetsActions.deleteProject(project.id),
            "/projets",
          );

          const gone = await prisma.project.findUnique({
            where: { id: project.id },
            select: { id: true },
          });
          expect(gone).toBeNull();
        },
        TIMEOUT,
      );
    });
  });
}
