import { test, expect } from "playwright/test";

// Pages d'erreur personnalisées (issue #67) — la 404 racine.
//
// Une URL publique inconnue n'est ni protégée (middleware) ni une route
// existante → elle rend `app/not-found.tsx` : page sobre EN FRANÇAIS, plus la
// « This page could not be found » anglaise de Next. Aucun secret ni aucune
// BDD requis (parcours 100 % public), la suite tourne donc partout.
//
// La 404 DANS le shell (`app/(app)/not-found.tsx`) et son absence de fuite de
// données sont déjà couvertes par les tests d'isolation A/B de
// clients-projets.spec.ts. L'`error.tsx` (frontière d'exception) n'est pas
// testable en E2E sans provoquer une vraie erreur serveur.

test.describe("Pages d'erreur (#67)", () => {
  test("404 racine : page française, lien de retour, zéro texte anglais", async ({
    page,
  }) => {
    const errors: string[] = [];
    // La 404 racine renvoie un VRAI statut HTTP 404 (elle n'est pas streamée,
    // cf. #56) → le navigateur journalise le chargement de la ressource comme
    // une « erreur » : bruit d'infra attendu, pas une erreur applicative.
    const isNoise = (t: string) => /Failed to load resource|404/i.test(t);
    page.on("console", (m) => {
      if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => !isNoise(String(e)) && errors.push(String(e)));

    await page.goto("/cette-page-n-existe-pas-42");

    // Contenu français attendu.
    await expect(
      page.getByRole("heading", { name: /page introuvable/i }),
    ).toBeVisible();

    // Le texte anglais par défaut de Next ne doit plus apparaître.
    await expect(page.getByText(/could not be found/i)).toHaveCount(0);

    // Le lien de retour ramène à l'accueil public.
    await page.getByRole("link", { name: /retour à l'accueil/i }).click();
    await expect(page).toHaveURL(/\/$/);

    expect(errors, `Erreurs console :\n${errors.join("\n")}`).toEqual([]);
  });
});
