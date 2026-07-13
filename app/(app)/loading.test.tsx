import { describe, test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import AppLoading from "./loading";

// Squelette de chargement du groupe (app) — issue #56.
//
// Composant server statique (aucun hook, aucune donnée) : renderToStaticMarkup
// suffit, pas besoin de DOM sous bun. Le contrat testé est l'ACCESSIBILITÉ et
// l'absence de faux contenu, pas le rendu visuel (couvert par les maquettes).

// Rendu une seule fois : le composant est pur et déterministe.
const html = renderToStaticMarkup(<AppLoading />);

describe("AppLoading — squelette de chargement du groupe (app)", () => {
  test("la racine annonce le chargement : role=status + aria-label exact", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Chargement de la page"');
  });

  test("un texte lecteur d'écran sr-only est présent", () => {
    expect(html).toContain('<span class="sr-only">Chargement de la page…</span>');
  });

  test("les blocs décoratifs sont sous aria-hidden (les 3 sections)", () => {
    // En-tête de page + rangée de cartes + grand bloc de contenu.
    const occurrences = html.match(/aria-hidden="true"/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  test("pulsation animate-pulse coupée par motion-reduce:animate-none", () => {
    // prefers-reduced-motion : l'animation doit pouvoir être désactivée.
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
  });

  test("aucun texte visible : le seul texte du markup est celui du sr-only", () => {
    // Pas de fausse donnée qui pourrait être confondue avec du contenu réel.
    const texte = html.replace(/<[^>]*>/g, "").trim();
    expect(texte).toBe("Chargement de la page…");
  });
});
