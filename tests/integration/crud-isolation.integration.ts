// -----------------------------------------------------------------------------
// Isolation & validation des server actions CRUD Clients (#5) et Projets (#6).
//
// Cœur de l'issue #31 : prouver, avec DEUX utilisateurs réels, que
//   app/(app)/clients/actions.ts  et  app/(app)/projets/actions.ts
// ne laissent JAMAIS fuiter la donnée d'un utilisateur vers un autre
// (where: { userId } sur chaque requête, contournement de la RLS Postgres par
// Prisma oblige), rejettent proprement les entrées invalides (zod, messages FR
// sans détail technique) et — protection la plus critique — REFUSENT qu'un
// projet soit rattaché au client d'autrui (appartenance transitive vérifiée
// AVANT écriture).
//
// POURQUOI un test bun:test ici plutôt qu'un spec Playwright (tests/e2e/) :
// ces actions sont de simples fonctions serveur (Prisma + zod). Leurs seules
// dépendances au contexte HTTP sont `requireUserId()` (cookie de session),
// `revalidatePath()` (cache Next) et `redirect()` (navigation). On les appelle
// ICI directement en remplaçant SEULEMENT ces trois fonctions par des mocks
// (bun:test `mock.module`, AVANT tout import dynamique des modules d'actions —
// un import statique serait hoisté par le moteur JS avant le mock et
// appellerait la vraie session). Aucun mock du code testé lui-même : vraie
// authentification Supabase réelle, vraie base Prisma réelle. Même pattern que
// tests/integration/paywall-quota.integration.ts.
//
// L'API externe « Recherche d'entreprises » (lookupSiret / searchCompanies)
// est le SEUL point réseau tiers : on ne l'appelle JAMAIS pour de vrai dans un
// test committé (flaky, dépend d'un service de l'État). On mocke
// `globalThis.fetch` UNIQUEMENT le temps de ces tests (sauvegarde/restauration
// en finally) pour ne pas perturber les appels fetch internes de supabase-js.
//
// EXTENSION : `.integration.ts`, pas `.test.ts` — `bun test` sans argument ne
// découvre donc jamais ce fichier (voir bunfig.toml). Lancé explicitement via
// `bun run test:integration`. Secrets lus depuis .env.local (best-effort, sans
// écraser une variable déjà présente). Absents => suite SKIPPÉE proprement.
// Projet Supabase = celui de .env.local (dev, jamais la prod, tant que #17 n'a
// pas séparé dev/prod). Tout utilisateur/donnée créé est nettoyé en afterAll,
// y compris si un test échoue.

import { test, expect, mock, describe, beforeAll, afterAll } from "bun:test";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ClientDetail,
  ClientListItem,
  SiretLookupResult,
  CompanySearchItem,
} from "@/app/(app)/clients/actions";
import type {
  ProjectDetail,
  ProjectListItem,
  ClientOption,
  ActionState,
} from "@/app/(app)/projets/actions";

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
  describe.skip("CRUD Clients & Projets — isolation (#31)", () => {
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
  // `redirect()` (succès de createClient/createProject) lève NEXT_REDIRECT en
  // vrai : on le remplace par une erreur typée qu'on peut attraper pour lire
  // le chemin de destination (et en extraire l'id créé).
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
  const PASSWORD = `Test-crud-${RUN_ID}-Aa1!`;

  async function createRealUser(slug: string) {
    const email = `test-crud-${slug}-${RUN_ID}@freelanceflow.test`;
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

  // Exécute une action censée réussir en redirigeant (createClient /
  // createProject) et renvoie l'id extrait du chemin `/xxx/<id>`.
  async function callAndCaptureRedirect(
    action: () => Promise<ActionState>,
    expectedPrefix: string,
  ): Promise<string> {
    try {
      const result = await action();
      throw new Error(
        `L'action devait rediriger mais a renvoyé : ${JSON.stringify(result)}`,
      );
    } catch (e) {
      if (e instanceof RedirectSignal) {
        expect(e.path.startsWith(expectedPrefix)).toBe(true);
        return e.path.slice(expectedPrefix.length);
      }
      throw e;
    }
  }

  // Remplace globalThis.fetch le temps d'un appel, puis le restaure TOUJOURS
  // (finally) — indispensable pour ne pas casser les fetch internes de
  // supabase-js utilisés dans beforeAll/afterAll.
  async function withMockedFetch<T>(
    impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = impl as unknown as typeof fetch;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  }

  describe("CRUD Clients & Projets — isolation (#31)", () => {
    let userA: { id: string; email: string };
    let userB: { id: string; email: string };
    // Données "préexistantes" créées DIRECTEMENT via Prisma (fixtures
    // d'isolation) : un client de B + un projet de B, un client de A.
    let clientBId = "";
    let projectBId = "";
    let clientAId = "";

    beforeAll(async () => {
      userA = await createRealUser("a");
      userB = await createRealUser("b");

      // Laisse le trigger `on_auth_user_created` créer la ligne public.users
      // avant d'y référencer un client/projet.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const clientB = await prisma.client.create({
        data: { userId: userB.id, name: `Client B ${RUN_ID}` },
        select: { id: true },
      });
      clientBId = clientB.id;
      const projectB = await prisma.project.create({
        data: {
          userId: userB.id,
          clientId: clientB.id,
          name: `Projet secret de B ${RUN_ID}`,
        },
        select: { id: true },
      });
      projectBId = projectB.id;

      const clientA = await prisma.client.create({
        data: { userId: userA.id, name: `Client A initial ${RUN_ID}` },
        select: { id: true },
      });
      clientAId = clientA.id;
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
    // CLIENTS — validation zod de createClient
    // ----------------------------------------------------------------------
    describe("clients — createClient : validation", () => {
      test("name vide -> { error }, aucun client créé", async () => {
        activeUserId = userA.id;
        const before = await prisma.client.count({ where: { userId: userA.id } });
        const result = await clientsActions.createClient({ name: "" });
        expect(result).toEqual({ error: "Le nom du client est requis." });
        const after = await prisma.client.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test("name uniquement composé d'espaces -> { error }, aucun client créé", async () => {
        activeUserId = userA.id;
        const before = await prisma.client.count({ where: { userId: userA.id } });
        const result = await clientsActions.createClient({ name: "   " });
        expect(result).toEqual({ error: "Le nom du client est requis." });
        const after = await prisma.client.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test("email invalide -> { error }, aucun client créé", async () => {
        activeUserId = userA.id;
        const before = await prisma.client.count({ where: { userId: userA.id } });
        const result = await clientsActions.createClient({
          name: "Client valide",
          email: "pas-un-email",
        });
        expect(result).toEqual({ error: "Adresse e-mail invalide." });
        const after = await prisma.client.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test("SIRET à 13 chiffres -> { error }, aucun client créé", async () => {
        activeUserId = userA.id;
        const before = await prisma.client.count({ where: { userId: userA.id } });
        const result = await clientsActions.createClient({
          name: "Client valide",
          siret: "1234567890123",
        });
        expect(result).toEqual({ error: "Le SIRET doit comporter 14 chiffres." });
        const after = await prisma.client.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test(
        "entrée valide -> client créé (redirect) et relu par getClient avec les bons champs (SIRET normalisé)",
        async () => {
          activeUserId = userA.id;
          const createdId = await callAndCaptureRedirect(
            () =>
              clientsActions.createClient({
                name: "Studio Alpha",
                siret: "842 519 637 00021",
                email: "contact@studio-alpha.test",
                phone: "0601020304",
                address: "1 rue du Test, 75000 Paris",
                sector: "Design",
              }),
            "/clients/",
          );
          expect(createdId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          );

          const detail: ClientDetail | null =
            await clientsActions.getClient(createdId);
          expect(detail).not.toBeNull();
          expect(detail!.name).toBe("Studio Alpha");
          // SIRET normalisé (espaces retirés).
          expect(detail!.siret).toBe("84251963700021");
          expect(detail!.email).toBe("contact@studio-alpha.test");
          expect(detail!.phone).toBe("0601020304");
          expect(detail!.address).toBe("1 rue du Test, 75000 Paris");
          expect(detail!.sector).toBe("Design");
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // CLIENTS — isolation
    // ----------------------------------------------------------------------
    describe("clients — isolation (where: { userId })", () => {
      test("listClients() « comme A » ne renvoie QUE les clients de A", async () => {
        activeUserId = userA.id;
        const list: ClientListItem[] = await clientsActions.listClients();
        // A possède au moins son client initial + celui créé plus haut.
        expect(list.length).toBeGreaterThanOrEqual(2);
        // Aucun client de B (ni son id, ni son nom) ne doit apparaître.
        expect(list.some((c) => c.id === clientBId)).toBe(false);
        expect(list.some((c) => c.name.includes("Client B"))).toBe(false);
      });

      test("getClient(<client de B>) « comme A » -> null (jamais la donnée de B)", async () => {
        activeUserId = userA.id;
        const leaked = await clientsActions.getClient(clientBId);
        expect(leaked).toBeNull();
      });

      test("getClient(<client de B>) « comme B » -> la fiche (sanity : la donnée existe bien)", async () => {
        activeUserId = userB.id;
        const own = await clientsActions.getClient(clientBId);
        expect(own).not.toBeNull();
        expect(own!.id).toBe(clientBId);
      });

      test("getClient(id non-UUID) -> null proprement (pas d'exception)", async () => {
        activeUserId = userA.id;
        expect(await clientsActions.getClient("pas-un-uuid")).toBeNull();
        expect(await clientsActions.getClient("")).toBeNull();
      });
    });

    // ----------------------------------------------------------------------
    // CLIENTS — lookupSiret / searchCompanies : dégradation propre (fetch mocké)
    // ----------------------------------------------------------------------
    describe("clients — lookupSiret / searchCompanies : dégradation propre", () => {
      test("lookupSiret(SIRET malformé) -> { verified: false } SANS toucher au réseau", async () => {
        activeUserId = userA.id;
        // fetch remplacé par une sonde qui échoue si elle est appelée : le
        // chemin d'entrée invalide doit court-circuiter AVANT tout appel réseau.
        const result = await withMockedFetch(
          async () => {
            throw new Error("fetch NE DOIT PAS être appelé pour un SIRET malformé");
          },
          () => clientsActions.lookupSiret("123"),
        );
        expect(result).toEqual({ verified: false });
      });

      test("lookupSiret(SIRET valide) -> { verified, name, address } depuis la réponse mockée", async () => {
        activeUserId = userA.id;
        const siret = "84251963700021";
        const result: SiretLookupResult = await withMockedFetch(
          async () =>
            new Response(
              JSON.stringify({
                results: [
                  {
                    nom_complet: "STUDIO ALPHA",
                    siege: { adresse: "1 RUE DU TEST 75000 PARIS" },
                    matching_etablissements: [
                      { siret, adresse: "1 RUE DU TEST 75000 PARIS" },
                    ],
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          () => clientsActions.lookupSiret(siret),
        );
        expect(result.verified).toBe(true);
        expect(result.name).toBe("STUDIO ALPHA");
        expect(result.address).toBe("1 RUE DU TEST 75000 PARIS");
      });

      test("lookupSiret : panne réseau (fetch throw) -> { verified: false } (jamais d'exception)", async () => {
        activeUserId = userA.id;
        const result = await withMockedFetch(
          async () => {
            throw new Error("réseau indisponible (simulé)");
          },
          () => clientsActions.lookupSiret("84251963700021"),
        );
        expect(result).toEqual({ verified: false });
      });

      test("lookupSiret : réponse HTTP non-ok (500) -> { verified: false }", async () => {
        activeUserId = userA.id;
        const result = await withMockedFetch(
          async () => new Response("boom", { status: 500 }),
          () => clientsActions.lookupSiret("84251963700021"),
        );
        expect(result).toEqual({ verified: false });
      });

      test("searchCompanies(query < 3 caractères) -> [] SANS toucher au réseau", async () => {
        activeUserId = userA.id;
        const result = await withMockedFetch(
          async () => {
            throw new Error("fetch NE DOIT PAS être appelé pour une requête trop courte");
          },
          () => clientsActions.searchCompanies("ab"),
        );
        expect(result).toEqual([]);
      });

      test("searchCompanies(query valide) -> suggestions depuis la réponse mockée", async () => {
        activeUserId = userA.id;
        const result: CompanySearchItem[] = await withMockedFetch(
          async () =>
            new Response(
              JSON.stringify({
                results: [
                  {
                    nom_complet: "STUDIO ALPHA",
                    siege: {
                      siret: "84251963700021",
                      adresse: "1 RUE DU TEST",
                      libelle_commune: "PARIS",
                    },
                  },
                  // Entrée sans siret de siège : doit être ignorée (filtrée).
                  { nom_complet: "SANS SIRET", siege: {} },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          () => clientsActions.searchCompanies("studio alpha"),
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          siret: "84251963700021",
          name: "STUDIO ALPHA",
          address: "1 RUE DU TEST",
          city: "PARIS",
        });
      });

      test("searchCompanies : panne réseau (fetch throw) -> [] (jamais d'exception)", async () => {
        activeUserId = userA.id;
        const result = await withMockedFetch(
          async () => {
            throw new Error("réseau indisponible (simulé)");
          },
          () => clientsActions.searchCompanies("studio alpha"),
        );
        expect(result).toEqual([]);
      });
    });

    // ----------------------------------------------------------------------
    // PROJETS — appartenance transitive (protection la PLUS critique)
    // ----------------------------------------------------------------------
    describe("projets — createProject : appartenance transitive du clientId", () => {
      test(
        "SÉCURITÉ : createProject({ clientId: <client de B> }) « comme A » -> refusé, aucun projet créé",
        async () => {
          activeUserId = userA.id;
          const before = await prisma.project.count({ where: { userId: userA.id } });

          const result: ActionState = await projetsActions.createProject({
            name: "Tentative de vol de client",
            clientId: clientBId, // client appartenant à B
          });
          expect(result).toEqual({ error: "Client introuvable." });

          const after = await prisma.project.count({ where: { userId: userA.id } });
          expect(after).toBe(before);
          // Le compteur de projets de B ne bouge pas non plus.
          const bProjects = await prisma.project.count({
            where: { userId: userB.id },
          });
          expect(bProjects).toBeGreaterThanOrEqual(1);
        },
        TIMEOUT,
      );

      test(
        "réciproque : createProject({ clientId: <client de A> }) « comme B » -> refusé",
        async () => {
          activeUserId = userB.id;
          const result = await projetsActions.createProject({
            name: "Tentative inverse",
            clientId: clientAId, // client appartenant à A
          });
          expect(result).toEqual({ error: "Client introuvable." });
        },
        TIMEOUT,
      );

      test("titre vide -> { error }, aucune écriture", async () => {
        activeUserId = userA.id;
        const before = await prisma.project.count({ where: { userId: userA.id } });
        const result = await projetsActions.createProject({
          name: "  ",
          clientId: clientAId,
        });
        expect(result).toEqual({ error: "Le titre de la mission est requis." });
        const after = await prisma.project.count({ where: { userId: userA.id } });
        expect(after).toBe(before);
      });

      test("clientId non-UUID -> { error }", async () => {
        activeUserId = userA.id;
        const result = await projetsActions.createProject({
          name: "Projet",
          clientId: "pas-un-uuid",
        });
        expect(result).toEqual({ error: "Client invalide." });
      });

      test("clientId UUID mais inexistant -> { error: Client introuvable. }", async () => {
        activeUserId = userA.id;
        const result = await projetsActions.createProject({
          name: "Projet",
          clientId: randomUUID(),
        });
        expect(result).toEqual({ error: "Client introuvable." });
      });

      test(
        "création valide (client de A + titre) -> projet créé (redirect) et relu par getProject",
        async () => {
          activeUserId = userA.id;
          const createdId = await callAndCaptureRedirect(
            () =>
              projetsActions.createProject({
                name: "Refonte du site",
                clientId: clientAId,
                notes: "Notes de test",
              }),
            "/projets/",
          );
          expect(createdId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          );

          const detail: ProjectDetail | null =
            await projetsActions.getProject(createdId);
          expect(detail).not.toBeNull();
          expect(detail!.name).toBe("Refonte du site");
          expect(detail!.clientId).toBe(clientAId);
          expect(detail!.notes).toBe("Notes de test");
          expect(detail!.status).toBe("en_cours"); // défaut
        },
        TIMEOUT,
      );
    });

    // ----------------------------------------------------------------------
    // PROJETS — isolation des lectures
    // ----------------------------------------------------------------------
    describe("projets — isolation (where: { userId })", () => {
      test("listProjects() « comme A » ne renvoie jamais le projet de B", async () => {
        activeUserId = userA.id;
        const list: ProjectListItem[] = await projetsActions.listProjects();
        expect(list.some((p) => p.id === projectBId)).toBe(false);
        expect(list.some((p) => p.name.includes("secret de B"))).toBe(false);
      });

      test("getProject(<projet de B>) « comme A » -> null", async () => {
        activeUserId = userA.id;
        expect(await projetsActions.getProject(projectBId)).toBeNull();
      });

      test("getProject(id non-UUID) -> null proprement", async () => {
        activeUserId = userA.id;
        expect(await projetsActions.getProject("pas-un-uuid")).toBeNull();
      });

      test("listClientOptions() « comme A » ne contient jamais un client de B", async () => {
        activeUserId = userA.id;
        const options: ClientOption[] = await projetsActions.listClientOptions();
        expect(options.some((o) => o.id === clientBId)).toBe(false);
        expect(options.some((o) => o.name.includes("Client B"))).toBe(false);
        // Sanity : A voit bien ses propres clients.
        expect(options.some((o) => o.id === clientAId)).toBe(true);
      });
    });
  });
}
