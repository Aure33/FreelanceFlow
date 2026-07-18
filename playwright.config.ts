import { defineConfig } from "playwright/test";

// Config Playwright pour les specs E2E VERSIONNÉES (tests/e2e/*.spec.ts),
// exécutées via `~/.bun/bin/bunx playwright test` — jamais `bun test` (qui ne
// découvre que les *.test.ts et n'a pas de navigateur).
//
// Port DÉDIÉ 3299, différent du 3199 utilisé par le skill /playwright-verify
// (script jetable de vérification manuelle) : les deux peuvent tourner sans
// se marcher dessus.
//
// `webServer` gère lui-même build + démarrage en mode PRODUCTION et attend
// que le serveur réponde avant de lancer les tests : `bunx playwright test`
// est autonome (pas besoin de préparer un serveur à la main au préalable).
const PORT = 3299;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // CI uniquement : les runners GitHub (lents, partagés) exposent une course
  // d'hydratation React — un clic peut partir avant que le handler soit
  // attaché (flaky observé sur main depuis le JS client Sentry, #88 :
  // duplicate-document, public-quote…). Un test qui re-flake est relancé dans
  // un worker NEUF (données re-semées via un nouveau RUN_ID, trace conservée).
  // En local : 0 retry — un échec doit se voir immédiatement.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run build && bun run start -- -p ${PORT}`,
    url: `${BASE_URL}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
