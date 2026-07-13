// -----------------------------------------------------------------------------
// Premier lancement (issue #60) — tests d'intégration de getOnboardingStatus().
//
// Server action testée : app/(app)/dashboard/actions.ts → getOnboardingStatus()
// (3 requêtes Prisma : siret du profil, count clients, count documents).
//
// Ce qu'on prouve, avec DEUX utilisateurs réels (Supabase Auth + Prisma réel) :
//   - COMPTE NEUF : { hasSiret: false, clientCount: 0, documentCount: 0 } —
//     c'est l'état qui déclenche l'écran d'onboarding (show=true côté pur) ;
//   - COMPTES RÉELS : en tant que B (qui possède 1 client + 1 document), les
//     compteurs remontent bien 1/1 — garde anti-tautologie : une action qui
//     renverrait toujours des zéros passerait le test d'isolation, pas celui-ci ;
//   - ISOLATION (critique, Prisma contourne la RLS) : les données de B ne
//     fuient JAMAIS dans les compteurs de A (counts filtrés `where { userId }`,
//     findUnique sur id = userId) ;
//   - hasSiret : null → false ; SIRET posé en base → true ; "   " (espaces
//     seuls, insérable car la colonne est un simple TEXT nullable) → false
//     (trim) — le cas espaces est AUSSI couvert en unitaire côté computeOnboarding,
//     ici on vérifie la normalisation faite par l'ACTION elle-même.
//
// dismissOnboarding() / isOnboardingDismissed() ne sont PAS testées ici : elles
// reposent sur cookies() de next/headers (contexte requête HTTP requis, absent
// sous bun test) — le comportement cookie est couvert en E2E
// (tests/e2e/onboarding.spec.ts).
//
// Même patron que tests/integration/crud-edit-delete.integration.ts : mock de
// la session AVANT import dynamique de l'action ; extension `.integration.ts`
// (jamais découverte par `bun test` nu — lancée via `bun run test:integration`) ;
// secrets lus depuis .env.local, suite SKIPPÉE proprement s'ils manquent ;
// nettoyage exhaustif en afterAll même en cas d'échec.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  describe.skip("Premier lancement — getOnboardingStatus (#60)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import de l'action --------
  // `activeUserId` est mutée entre les tests pour rejouer l'action « en tant
  // que » A ou B — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  // dashboard/actions.ts importe revalidatePath (utilisé par dismissOnboarding,
  // non testée ici) : no-op pour ne dépendre d'aucun contexte Next.
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));

  // Import DYNAMIQUE (après les mocks : un import statique serait hoisté avant
  // mock.module par le moteur JS et capterait la vraie session).
  const { getOnboardingStatus } = await import("@/app/(app)/dashboard/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-onb-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-onb-${slug}-${RUN_ID}@freelanceflow.test`;
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

  describe("Premier lancement — getOnboardingStatus (#60)", () => {
    let userA: { id: string; email: string }; // compte NEUF (aucune donnée)
    let userB: { id: string; email: string }; // possède 1 client + 1 document

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");

      // Laisse le trigger `on_auth_user_created` créer les lignes public.users
      // avant d'y rattacher des données.
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Données de B : 1 client, 1 projet, 1 document (brouillon minimal avec
      // une ligne — fixture Prisma directe, pas via saveDraft). Elles servent
      // à la fois de garde anti-tautologie (B voit 1/1) et de cible
      // d'isolation (A doit voir 0/0).
      const clientB = await prisma.client.create({
        data: {
          userId: userB.id,
          name: `Client onboarding B ${RUN_ID}`,
          paymentTerms: "30 jours",
        },
        select: { id: true },
      });
      const projectB = await prisma.project.create({
        data: {
          userId: userB.id,
          clientId: clientB.id,
          name: `Projet onboarding B ${RUN_ID}`,
        },
        select: { id: true },
      });
      await prisma.document.create({
        data: {
          userId: userB.id,
          projectId: projectB.id,
          type: "facture",
          status: "brouillon",
          lines: {
            create: [
              {
                userId: userB.id,
                label: "Ligne de test onboarding",
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

    test(
      "compte neuf : { hasSiret:false, clientCount:0, documentCount:0 }",
      async () => {
        activeUserId = userA.id;
        // Sanity : le trigger a bien créé le profil de A, siret NULL.
        const profileA = await prisma.user.findUnique({
          where: { id: userA.id },
          select: { siret: true },
        });
        expect(profileA).not.toBeNull();
        expect(profileA!.siret).toBeNull();

        expect(await getOnboardingStatus()).toEqual({
          hasSiret: false,
          clientCount: 0,
          documentCount: 0,
        });
      },
      TIMEOUT,
    );

    test(
      "anti-tautologie : B (1 client + 1 document) voit SES vrais compteurs",
      async () => {
        // Si getOnboardingStatus renvoyait des zéros en dur, le test
        // d'isolation ci-dessous passerait quand même — celui-ci le démasque.
        activeUserId = userB.id;
        expect(await getOnboardingStatus()).toEqual({
          hasSiret: false,
          clientCount: 1,
          documentCount: 1,
        });
      },
      TIMEOUT,
    );

    test(
      "ISOLATION : les données de B ne fuient pas dans les compteurs de A",
      async () => {
        // ANTI-RÉGRESSION : si le filtre `where: { userId }` sautait des
        // counts (Prisma contourne la RLS), A « verrait » le client et le
        // document de B -> clientCount/documentCount >= 1 et l'onboarding
        // disparaîtrait à tort (documentCount > 0 ⇒ show=false).
        activeUserId = userA.id;
        const status = await getOnboardingStatus();
        expect(status.clientCount).toBe(0);
        expect(status.documentCount).toBe(0);
      },
      TIMEOUT,
    );

    test(
      "hasSiret : SIRET posé en base -> true ; espaces seuls -> false (trim) ; retour à null -> false",
      async () => {
        activeUserId = userA.id;

        // SIRET valide posé DIRECTEMENT en base (pas via updateProfile : on ne
        // teste pas l'action avec une autre action).
        await prisma.user.update({
          where: { id: userA.id },
          data: { siret: "12345678901234" },
        });
        expect((await getOnboardingStatus()).hasSiret).toBe(true);

        // Espaces seuls : la colonne TEXT nullable les accepte, l'action doit
        // les traiter comme « pas de SIRET » (trim), sinon l'étape 1 serait
        // marquée terminée à tort.
        await prisma.user.update({
          where: { id: userA.id },
          data: { siret: "   " },
        });
        expect((await getOnboardingStatus()).hasSiret).toBe(false);

        // Retour à l'état neuf : les autres tests de A (isolation) restent
        // valables quel que soit l'ordre d'exécution.
        await prisma.user.update({
          where: { id: userA.id },
          data: { siret: null },
        });
        expect((await getOnboardingStatus()).hasSiret).toBe(false);
      },
      TIMEOUT,
    );
  });
}
