---
name: issue-flow
description: Workflow GitHub complet pour une tâche - crée une issue, crée une branche liée à l'issue, implémente la tâche, ouvre une PR et la merge une fois le build vert. Utiliser quand l'utilisateur demande de réaliser une fonctionnalité "avec une issue", "via le workflow GitHub", ou invoque /issue-flow.
argument-hint: <description de la tâche à réaliser>
---

# Issue Flow — issue → branche → implémentation → PR → merge

Réalise la tâche décrite dans `$ARGUMENTS` en suivant le workflow GitHub complet ci-dessous. Ne saute aucune étape. Si `$ARGUMENTS` est vide, demande à l'utilisateur quelle tâche réaliser avant de commencer.

## Étape 0 — Préparation

1. Vérifie que le working tree est propre (`git status`). S'il y a des modifications non commitées, ARRÊTE-TOI et demande à l'utilisateur quoi en faire.
2. Place-toi sur `main` à jour : `git checkout main && git pull origin main`.

## Étape 1 — Créer l'issue

1. À partir de la description de la tâche, rédige un titre court en français (max ~70 caractères) et un corps structuré : **Contexte**, **Objectif**, **Critères d'acceptation** (checklist), et la maquette de référence dans `design_ref/` si applicable.
2. Crée l'issue et récupère son numéro :
   ```bash
   gh issue create --title "<titre>" --body "<corps>" --assignee @me
   ```
   Le numéro est dans l'URL retournée (ex. `.../issues/12` → `12`).

## Étape 2 — Créer la branche liée à l'issue

Crée une branche **liée à l'issue** (GitHub la rattache automatiquement) et bascule dessus :

```bash
gh issue develop <numéro> --base main --name "feat/<numéro>-<slug-court>" --checkout
```

Convention de nommage : `feat/` (fonctionnalité), `fix/` (correctif), `chore/` (outillage) + numéro d'issue + slug kebab-case court.

## Étape 3 — Implémenter

1. Implémente la tâche en respectant les conventions du projet (voir CLAUDE.md : tokens uniquement, maquettes `design_ref/` comme référence, UI en français, accessibilité).
2. Vérifie que le build passe : `bun run build`. **Si le build échoue, corrige avant de continuer — jamais de PR rouge.**
3. **Tests committés obligatoires** : invoque l'agent `test-author` pour écrire les tests **versionnés** de la feature (unitaire `bun test` pour le métier pur ; intégration server actions + isolation `where userId`/RLS ; scénario E2E Playwright dans `tests/e2e/*.spec.ts` si la feature a un parcours UI). Fais passer `bun test` avant de continuer — **une feature sans test ne part pas en PR**.
4. **Vérification navigateur obligatoire** : invoque le skill `playwright-verify` pour tester la fonctionnalité en conditions réelles (screenshots clair/sombre vs maquette, interactions des critères d'acceptation, zéro erreur console). Corrige les écarts et re-vérifie avant de passer à l'étape suivante.

## Étape 4 — Commit et push

1. Commits atomiques avec des messages clairs en français, format : `feat: <résumé>` (ou `fix:`/`chore:`), référençant l'issue (`#<numéro>`).
2. Push : `git push -u origin <branche>`.

## Étape 5 — Pull Request

Crée la PR avec un corps qui résume les changements et **ferme l'issue automatiquement** :

```bash
gh pr create --base main --title "<titre>" --body "<résumé>

Closes #<numéro>"
```

## Étape 6 — Merge

1. Re-vérifie que le build local est vert. S'il y a des checks CI sur le repo, attends qu'ils passent (`gh pr checks --watch`).
2. Merge en squash et supprime la branche :
   ```bash
   gh pr merge --squash --delete-branch
   ```
3. Reviens sur main à jour : `git checkout main && git pull origin main`.

## Étape 7 — Compte rendu

Termine en résumant à l'utilisateur : numéro et lien de l'issue, branche, lien de la PR mergée, et fichiers principaux modifiés. Mets à jour la section « État d'avancement » de CLAUDE.md si la tâche correspond à un jalon de la roadmap.
