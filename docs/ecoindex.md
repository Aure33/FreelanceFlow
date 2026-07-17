# Audit éco-conception — EcoIndex (issue #62)

Exigence du cahier des charges (`design_ref/design_handoff_freelance_flow/README.md`) :
**EcoIndex ≥ B** sur les pages clés. Première mesure réalisée le **14 juillet 2026**.

**Résultat : grade A sur les 12 pages mesurées** (pire score : 81/100, le B
commence à 70). Objectif dépassé.

## Méthode

- Build de **production** local (`bun run build && bun run start`), mesures dans
  Chromium headless (Playwright) via **`scripts/eco/audit.ts`** (committé,
  rejouable : `bun scripts/eco/audit.ts` avec le serveur lancé sur 3199).
- Chaque page est chargée **à froid** (contexte navigateur neuf, cache vide) ;
  on mesure les 3 métriques officielles : éléments DOM
  (`querySelectorAll("*")`), requêtes HTTP (jusqu'à `networkidle`), poids
  transféré (octets encodés, compression comprise).
- Score et grade calculés avec la **formule officielle** (quantiles de
  cnumr/GreenIT-Analysis, www.ecoindex.fr) portée dans
  **`scripts/eco/ecoindex.ts`** (testée unitairement).
- Les pages de l'application sont mesurées avec un **compte éphémère semé**
  (1 client, 1 projet, 6 documents émis) sur le projet Supabase de dev — des
  pages vides donneraient des scores flatteurs et mensongers. Le compte est
  supprimé en fin d'audit.

## Résultats (14 juillet 2026, build prod)

| Page | DOM | Requêtes | Poids (Ko) | Score | Grade | GES (g éqCO₂) | Eau (cl) |
|---|---|---|---|---|---|---|---|
| `/` | 120 | 16 | 280,6 | 87,8 | **A** | 1,24 | 1,87 |
| `/connexion` | 80 | 13 | 275,4 | 89,5 | **A** | 1,21 | 1,81 |
| `/inscription` | 82 | 13 | 275,0 | 89,4 | **A** | 1,21 | 1,82 |
| `/dashboard` | 328 | 14 | 227,5 | 81,0 | **A** | 1,38 | 2,07 |
| `/clients` | 155 | 13 | 217,8 | 87,5 | **A** | 1,25 | 1,88 |
| `/projets` | 172 | 13 | 222,9 | 86,9 | **A** | 1,26 | 1,89 |
| `/factures` | 239 | 14 | 224,6 | 84,5 | **A** | 1,31 | 1,97 |
| `/devis` | 232 | 14 | 224,5 | 84,8 | **A** | 1,30 | 1,96 |
| `/documents/nouveau` | 293 | 13 | 229,2 | 82,5 | **A** | 1,35 | 2,02 |
| `/rapports` | 291 | 13 | 220,7 | 82,7 | **A** | 1,35 | 2,02 |
| `/abonnement` | 261 | 13 | 222,5 | 83,8 | **A** | 1,32 | 1,99 |
| `/parametres` | 323 | 14 | 250,6 | 81,1 | **A** | 1,38 | 2,07 |

## Lecture

- **Ce qui paie** : pas d'images décoratives (SVG inline + tokens CSS), polices
  self-hostées via `next/font` (2 familles), graphiques en CSS pur (pas de lib
  de charting client), `select` Prisma explicites (peu de HTML généré), aucun
  tracker/analytics tiers.
- **Pages les plus « denses »** : `/dashboard` et `/parametres` (~325 éléments
  DOM) — très loin du seuil critique (le quantile 10 de la formule est à
  603 éléments). Aucun correctif nécessaire.
- **JS par route** (gzip, premier chargement) : 95–113 Ko partout, sauf
  `/connexion` et `/inscription` (~171 Ko) qui embarquent le client Supabase
  navigateur, requis pour l'OAuth Google côté client (#19). Dérogation
  documentée dans le budget.

## Garde-fou CI (anti-régression)

**`scripts/eco/check-size-budget.ts`** est joué dans le job `build` de la CI
après chaque `next build` : il calcule le JS gzippé de premier chargement de
**chaque route** (via `.next/app-build-manifest.json`) et **fait échouer la CI**
si une route dépasse son budget (`scripts/eco/size-budget.json` : 130 Ko par
défaut, dérogations `/connexion`/`/inscription` à 190 Ko). Un import client
lourd (lib de graphes, moment.js…) est ainsi bloqué avant merge.

Pour toute dérogation nouvelle : justifier dans ce fichier + ajouter la route
dans `size-budget.json`.

### Dérogation — Sentry (issue #88, 16 juillet 2026)

L'ajout du SDK **`@sentry/nextjs`** (monitoring d'erreurs prod, #88) alourdit le
JS de premier chargement de **~10 Ko gzip sur chaque route authentifiée** —
même avec le tracing/Session Replay explicitement désactivés (aucun
`tracesSampleRate` ni `replaysSessionSampleRate` configurés, tree-shaking
`removeTracing`/`removeDebugLogging` activés dans `next.config.mjs`) : c'est le
coût **irréductible** de la capture d'erreurs + transport réseau du SDK.

Budget relevé : `defaultKb` **130 → 150** Ko, `/connexion`/`/inscription`
**190 → 210** Ko (ces deux routes embarquent déjà le client Supabase, cf.
dérogation précédente — l'overhead Sentry s'y ajoute).

Compromis assumé : un monitoring d'erreurs prod réel a plus de valeur pour ce
projet (diagnostiquer un incident comme celui du 10/07, cf. #67) que les
quelques Ko économisés — et le nouveau budget reste **très loin** de tout seuil
d'alerte utilisateur (une page ~150 Ko gzip charge en un instant même en 3G).
Aucun changement sur les métriques EcoIndex mesurées (DOM/requêtes/poids
transféré) : le tableau ci-dessus reste représentatif, seul le budget CI JS a
été relevé.

## Rejouer l'audit

```bash
bun run build && (bun run start -- -p 3199 &)
bun scripts/eco/audit.ts        # imprime le tableau + verdict (exit 1 si < B)
bun scripts/eco/check-size-budget.ts  # budget JS par route (exit 1 si dépassement)
```
