// -----------------------------------------------------------------------------
// Exactitude serveur du profil — page /parametres (issue #12).
//
// C'est le cœur métier de l'issue : `updateProfile()` (app/(app)/parametres/
// actions.ts) ne doit écrire QUE les clés réellement présentes dans son input
// (les autres champs du profil ne doivent JAMAIS être écrasés/réinitialisés),
// valider/normaliser chaque champ (SIRET 14 chiffres, IBAN/BIC, régime TVA)
// et REJETER sans effet de bord toute entrée invalide (aucune écriture
// partielle en base). `getProfile()` doit exposer un `nextDocumentNumber` qui
// est un APERÇU pur (jamais figé, jamais réservé tant qu'aucun document n'est
// réellement émis).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright (tests/e2e/) :
// `getProfile`/`updateProfile` sont de simples fonctions serveur (Prisma +
// validation zod), sans autre dépendance au contexte HTTP que
// `requireUserId()` et `revalidatePath()`. On les appelle ICI directement, en
// remplaçant seulement ces deux fonctions par des mocks (bun:test
// `mock.module`, AVANT tout import dynamique des modules d'actions — un
// import statique serait hoisté par le moteur JS avant le mock et
// appellerait la vraie session). Vraie authentification Supabase réelle,
// vraie base Prisma réelle, aucun mock du code testé lui-même — même pattern
// que tests/integration/paywall-quota.integration.ts et
// tests/integration/reports-data.integration.ts.
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

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ProfileData,
  UpdateProfileResult,
} from "@/app/(app)/parametres/actions";
import type { DocumentInput, EmitResult } from "@/app/(app)/documents/actions";

const TIMEOUT = 30_000; // écritures réseau réelles (Supabase + Prisma) : plus lent qu'un aller-retour JSON

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
  describe.skip("Paramètres — profil, exactitude serveur (#12)", () => {
    test("secrets Supabase absents — cf. .env.local / #17", () => {});
  });
} else {
  // --- Mocks du contexte requête HTTP, AVANT tout import des actions --------
  // `activeUserId` est mutée entre les tests pour rejouer les actions "en
  // tant que" A ou B — comme le ferait un cookie de session différent.
  let activeUserId = "";
  mock.module("@/lib/auth/session", () => ({
    requireUserId: async () => activeUserId,
  }));
  mock.module("next/cache", () => ({
    revalidatePath: () => {},
  }));

  // Import DYNAMIQUE (après les mocks : un import statique serait hoisté
  // avant mock.module par le moteur JS et capterait la vraie session).
  const { getProfile, updateProfile } = await import(
    "@/app/(app)/parametres/actions"
  );
  const { emitDocument } = await import("@/app/(app)/documents/actions");

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const prisma = new PrismaClient();
  const RUN_ID = randomUUID().slice(0, 8);
  const PASSWORD = `Test-parametres-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-parametres-${slug}-${RUN_ID}@freelanceflow.test`;
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

  function expectOk(
    result: UpdateProfileResult,
  ): asserts result is { ok: true } {
    if ("error" in result) {
      throw new Error(
        `updateProfile() a été refusé alors qu'il devait réussir : ${result.error}`,
      );
    }
  }

  function expectRejected(result: UpdateProfileResult, message?: string) {
    if (!("error" in result)) {
      throw new Error(
        "updateProfile() a été accepté alors qu'il devait être refusé.",
      );
    }
    if (message !== undefined) {
      expect(result.error).toBe(message);
    }
  }

  describe("Paramètres — profil, exactitude serveur (#12)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    let projA: { clientId: string; projectId: string } | null = null;

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant qu'on ne lise/écrive son profil.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }, TIMEOUT);

    afterAll(async () => {
      // Nettoyage — toujours exécuté, même si un test a échoué en cours de
      // route. Ordre imposé par les contraintes RESTRICT du schéma.
      for (const u of [userA, userB]) {
        try {
          if (u?.id) await prisma.document.deleteMany({ where: { userId: u.id } });
        } catch (e) {
          console.warn(`Nettoyage documents (${u?.email}) échoué :`, e);
        }
      }
      if (projA?.projectId) {
        try {
          await prisma.project.delete({ where: { id: projA.projectId } });
        } catch (e) {
          console.warn("Nettoyage projet échoué :", e);
        }
      }
      if (projA?.clientId) {
        try {
          await prisma.client.delete({ where: { id: projA.clientId } });
        } catch (e) {
          console.warn("Nettoyage client échoué :", e);
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

    test("getProfile() initial : valeurs par défaut cohérentes (tvaRegime: reel, planType: free)", async () => {
      activeUserId = userA.id;
      const profile: ProfileData = await getProfile();
      expect(profile.email).toBe(userA.email);
      expect(profile.name).toBeNull();
      expect(profile.activity).toBeNull();
      expect(profile.phone).toBeNull();
      expect(profile.address).toBeNull();
      expect(profile.siret).toBeNull();
      expect(profile.iban).toBeNull();
      expect(profile.bic).toBeNull();
      expect(profile.tvaRegime).toBe("reel");
      expect(profile.planType).toBe("free");
      expect(profile.nextDocumentNumber).toMatch(/^FAC-\d{4}-001$/);
    });

    test(
      "updateProfile({name, activity, phone, address}) persiste EXACTEMENT ces 4 champs",
      async () => {
        activeUserId = userA.id;
        const result = await updateProfile({
          name: "Camille Test",
          activity: "Développeuse indépendante",
          phone: "0601020304",
          address: "12 rue de Test, 75000 Paris",
        });
        expectOk(result);

        const profile = await getProfile();
        expect(profile.name).toBe("Camille Test");
        expect(profile.activity).toBe("Développeuse indépendante");
        expect(profile.phone).toBe("0601020304");
        expect(profile.address).toBe("12 rue de Test, 75000 Paris");
      },
      TIMEOUT,
    );

    test(
      "non-écrasement : updateProfile({siret}) seul ne touche PAS name/activity/phone/address, et normalise le SIRET",
      async () => {
        activeUserId = userA.id;
        const result = await updateProfile({ siret: "842 519 637 00021" });
        expectOk(result);

        const profile = await getProfile();
        // Le SIRET est bien normalisé (espaces supprimés).
        expect(profile.siret).toBe("84251963700021");
        // Les 4 champs de l'étape précédente sont INCHANGÉS — pas écrasés par
        // les clés absentes de cet appel.
        expect(profile.name).toBe("Camille Test");
        expect(profile.activity).toBe("Développeuse indépendante");
        expect(profile.phone).toBe("0601020304");
        expect(profile.address).toBe("12 rue de Test, 75000 Paris");
      },
      TIMEOUT,
    );

    test(
      "rejet : name vide -> erreur, aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        const result = await updateProfile({ name: "" });
        expectRejected(result, "Le nom ne peut pas être vide.");

        const after = await getProfile();
        expect(after.name).toBe(before.name);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "rejet : SIRET à 13 chiffres -> erreur, aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        const result = await updateProfile({ siret: "1234567890123" });
        expectRejected(result, "Le SIRET doit comporter 14 chiffres.");

        const after = await getProfile();
        expect(after.siret).toBe(before.siret);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "rejet : SIRET à 15 chiffres -> erreur, aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        const result = await updateProfile({ siret: "123456789012345" });
        expectRejected(result, "Le SIRET doit comporter 14 chiffres.");

        const after = await getProfile();
        expect(after.siret).toBe(before.siret);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "rejet : IBAN invalide -> erreur, aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        const result = await updateProfile({ iban: "PAS-UN-IBAN" });
        expectRejected(result);

        const after = await getProfile();
        expect(after.iban).toBe(before.iban);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "rejet : BIC invalide -> erreur, aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        const result = await updateProfile({ bic: "123" });
        expectRejected(result);

        const after = await getProfile();
        expect(after.bic).toBe(before.bic);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "rejet : tvaRegime hors union -> erreur (zod protège même une entrée mal typée), aucun champ modifié",
      async () => {
        activeUserId = userA.id;
        const before = await getProfile();

        // Cast volontaire : zod doit rejeter même si TypeScript ne bloque pas
        // à la compilation (ex. valeur venant d'un JSON.parse non typé).
        const result = await updateProfile({
          tvaRegime: "invalide" as unknown as "franchise" | "reel" | "normal",
        });
        expectRejected(result);

        const after = await getProfile();
        expect(after.tvaRegime).toBe(before.tvaRegime);
        expect(after).toEqual(before);
      },
      TIMEOUT,
    );

    test(
      "IBAN/BIC valides sont acceptés, normalisés (majuscules, sans espaces) et persistés",
      async () => {
        activeUserId = userA.id;
        const result = await updateProfile({
          iban: "fr76 3000 6000 0112 3456 7890 189",
          bic: "bnpafrpp",
        });
        expectOk(result);

        const profile = await getProfile();
        expect(profile.iban).toBe("FR7630006000011234567890189");
        expect(profile.bic).toBe("BNPAFRPP");
        // Non-écrasement (rejoué ici, plus tard dans le scénario) : cet appel
        // ne mentionne PAS siret — le SIRET normalisé plus haut doit être
        // TOUJOURS présent, pas réinitialisé à null.
        expect(profile.siret).toBe("84251963700021");
      },
      TIMEOUT,
    );

    test(
      "updateProfile({tvaRegime}) : franchise puis normal, persisté à chaque fois",
      async () => {
        activeUserId = userA.id;

        const r1 = await updateProfile({ tvaRegime: "franchise" });
        expectOk(r1);
        const p1 = await getProfile();
        expect(p1.tvaRegime).toBe("franchise");

        const r2 = await updateProfile({ tvaRegime: "normal" });
        expectOk(r2);
        const p2 = await getProfile();
        expect(p2.tvaRegime).toBe("normal");
        // Non-écrasement, encore : ni r1 ni r2 ne mentionnent siret — il doit
        // rester celui normalisé plus haut.
        expect(p2.siret).toBe("84251963700021");
      },
      TIMEOUT,
    );

    test(
      "nextDocumentNumber : aperçu pur (2 lectures successives identiques, sans rien émettre), puis avance réellement après une vraie émission",
      async () => {
        activeUserId = userA.id;

        const read1 = await getProfile();
        const read2 = await getProfile();
        expect(read2.nextDocumentNumber).toBe(read1.nextDocumentNumber);

        // Crée un client + projet réels pour A, puis émet un vrai document.
        const client = await prisma.client.create({
          data: { userId: userA.id, name: `Client parametres ${RUN_ID}` },
          select: { id: true },
        });
        const project = await prisma.project.create({
          data: {
            userId: userA.id,
            clientId: client.id,
            name: `Projet parametres ${RUN_ID}`,
          },
          select: { id: true },
        });
        projA = { clientId: client.id, projectId: project.id };

        const emitInput: DocumentInput = {
          type: "facture",
          projectId: project.id,
          lines: [
            {
              label: "Prestation de test",
              quantity: 1,
              unitPriceCents: 10_000,
              tvaRate: 20,
            },
          ],
        };
        const emitted: EmitResult = await emitDocument(emitInput);
        if ("error" in emitted) {
          throw new Error(`Émission refusée alors qu'elle devait réussir : ${emitted.error}`);
        }
        expect(emitted.number).toBe(read1.nextDocumentNumber);

        const read3 = await getProfile();
        expect(read3.nextDocumentNumber).not.toBe(read1.nextDocumentNumber);
      },
      TIMEOUT,
    );

    test(
      "isolation : le profil de B est indépendant de celui de A (défauts propres, non affecté par les updates de A)",
      async () => {
        activeUserId = userB.id;
        const profileB = await getProfile();

        // B n'a jamais été touché : toujours les valeurs par défaut, jamais
        // rien de ce qu'on a écrit pour A (name, siret, iban, bic, tvaRegime).
        expect(profileB.email).toBe(userB.email);
        expect(profileB.name).toBeNull();
        expect(profileB.activity).toBeNull();
        expect(profileB.phone).toBeNull();
        expect(profileB.address).toBeNull();
        expect(profileB.siret).toBeNull();
        expect(profileB.iban).toBeNull();
        expect(profileB.bic).toBeNull();
        expect(profileB.tvaRegime).toBe("reel");
        expect(profileB.planType).toBe("free");
        // B n'a rien émis : le prochain numéro repart bien à 001.
        expect(profileB.nextDocumentNumber).toMatch(/^FAC-\d{4}-001$/);

        // Un update sur B ne doit rien changer chez A.
        const resultB = await updateProfile({ name: "Profil B" });
        expectOk(resultB);

        activeUserId = userA.id;
        const profileAAfter = await getProfile();
        expect(profileAAfter.name).toBe("Camille Test");
        expect(profileAAfter.name).not.toBe("Profil B");
      },
      TIMEOUT,
    );
  });
}
