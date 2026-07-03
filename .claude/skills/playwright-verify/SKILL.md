---
name: playwright-verify
description: Vérifie dans un vrai navigateur (Playwright + Chromium headless) qu'une fonctionnalité de FreelanceFlow marche - screenshots clair/sombre comparés aux maquettes, interactions, erreurs console, navigation clavier. Utiliser après chaque implémentation d'écran ou de feature, avant toute PR, ou quand l'utilisateur demande de "tester", "vérifier" ou invoque /playwright-verify.
argument-hint: [route ou fonctionnalité à vérifier]
---

# Playwright Verify — vérification navigateur d'une fonctionnalité

Vérifie que la fonctionnalité décrite dans `$ARGUMENTS` (ou les derniers changements si vide) fonctionne réellement dans un navigateur. Ne jamais déclarer une feature « terminée » sur la seule foi d'un build vert.

## Prérequis (déjà installés)

- `playwright` en devDependency, Chromium headless dans `~/.cache/ms-playwright`.
- Si le lancement échoue sur des bibliothèques système manquantes (`libnspr4.so`…), demander à l'utilisateur d'exécuter : `sudo ~/.bun/bin/bunx playwright install-deps chromium` (mot de passe requis, je ne peux pas le faire moi-même).

## Étape 1 — Démarrer l'app

```bash
bun run build && (bun run start -- -p 3199 >/tmp/ff-start.log 2>&1 &) && sleep 4
```

Port dédié **3199** pour ne pas entrer en conflit avec un éventuel `bun run dev` de l'utilisateur sur 3000.

## Étape 2 — Écrire le script de vérification (dans le scratchpad, PAS dans le repo)

Script TypeScript exécuté avec `bun <script>.ts`, sur ce modèle — adapter les interactions aux critères d'acceptation de l'issue en cours :

```ts
import { chromium } from "playwright";

const base = "http://localhost:3199";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/<route>`, { waitUntil: "networkidle" });
await page.screenshot({ path: "<scratchpad>/<route>-light.png", fullPage: true });

// Thème sombre (clé localStorage ff-theme + attribut data-theme)
await page.evaluate(() => {
  localStorage.setItem("ff-theme", "dark");
  document.documentElement.setAttribute("data-theme", "dark");
});
await page.screenshot({ path: "<scratchpad>/<route>-dark.png", fullPage: true });

// … interactions selon les critères : clics, formulaires, assertions de contenu,
// navigation clavier (page.keyboard.press("Tab")), état actif, modales + Échap …

console.log("erreurs console:", errors.length ? errors : "aucune");
await browser.close();
```

**Comparaison maquette** : capturer aussi la maquette de référence pour comparer côte à côte :
```ts
await page.goto("file:///home/aurelien/Ynov/FreelanceFlow/design_ref/design_handoff_freelance_flow/<Maquette>.html");
await page.screenshot({ path: "<scratchpad>/ref.png", fullPage: true });
```

## Étape 3 — Analyser

1. **Lire les screenshots** avec l'outil Read et les comparer visuellement à la maquette : layout, espacements, couleurs des tokens, tags de statut, les deux thèmes.
2. **Zéro erreur console/page** tolérée.
3. Vérifier les points d'accessibilité applicables : focus visible au Tab, `aria-current` sur la nav, modales fermables à Échap.

## Étape 4 — Nettoyer et conclure

```bash
pkill -f "next-server"
```

Rapporter : ce qui a été vérifié, écarts éventuels avec la maquette, erreurs trouvées. **Corriger les écarts avant de continuer** (re-vérifier après correction).
