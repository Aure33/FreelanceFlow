# FreelanceFlow — Contexte projet

SaaS B2B de facturation pour indépendants (projet Ynov, évaluation RNCP). Proposition de valeur : générer un devis/facture PDF conforme (TVA, mentions légales) **en moins de 2 minutes et 3 clics**.

## Source de vérité

**`design_ref/design_handoff_freelance_flow/README.md`** = cahier des charges complet : 21 maquettes HTML hifi, architecture des routes, design tokens, modèle Prisma, règles RLS, accessibilité (RGAA/WCAG AA), sécurité, éco-conception (EcoIndex ≥ B).

Pour implémenter un écran : lire la maquette HTML correspondante dans `design_ref/design_handoff_freelance_flow/` (ex. `Factures.html`) et recréer l'UI **pixel-perfect** avec les tokens. Le design system CSS complet est dans `styles/freelance-flow.css` (même dossier).

## Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 14.2 (App Router) + TypeScript |
| Styling | Tailwind CSS v3 + shadcn/ui (style new-york, prérequis installés, aucun composant ajouté encore) |
| Auth & BDD | Supabase (PostgreSQL + RLS + Storage) — BDD + auth branchées (#4, #3) |
| ORM | Prisma 6 — installé, client `lib/prisma.ts` (pooler 6543) |
| PDF | Puppeteer (route API serveur) — **pas encore fait** |
| Déploiement | Vercel |

## ⚠️ Environnement : Bun, pas Node

Node n'est PAS installé dans WSL. Utiliser **Bun** (`~/.bun/bin/bun`, normalement dans le PATH) :

```bash
bun install          # dépendances
bun run dev          # serveur de dev
bun run build        # build de prod
bunx shadcn add <c>  # ajouter un composant shadcn
```

## État d'avancement

### ✅ Fait
- Scaffold Next.js 14 + Tailwind v3 + ESLint (install via bun)
- **Design tokens** : `app/globals.css` — tokens oklch complets (thème clair `:root` + sombre `[data-theme="dark"]`), copie conforme de `freelance-flow.css`
- **Mapping Tailwind** : `tailwind.config.ts` — toutes les couleurs/rayons/ombres/spacing en classes
- **Polices** : Schibsted Grotesk (sans) + JetBrains Mono (mono) via `next/font/google`, variables `--font-sans`/`--font-mono`, `display: swap`
- **Thème clair/sombre** : script inline anti-flash dans `app/layout.tsx`, clé `localStorage['ff-theme']`, attribut `data-theme` sur `<html>` (le toggle UI dans Paramètres reste à faire)
- **Shell applicatif** : `app/(app)/layout.tsx` + `components/layout/sidebar.tsx` / `topbar.tsx` — sidebar 248px (brand, nav + badges, jauge freemium, user-chip), topbar 64px sticky backdrop-blur (titre par route, recherche ⌘K, notifs)
- **Stubs** : pages placeholder pour /dashboard, /clients, /projets, /devis, /factures, /rapports, /abonnement, /parametres (`components/layout/page-placeholder.tsx`) ; `/` redirige provisoirement vers /dashboard
- **Prérequis shadcn** : `components.json`, `lib/utils.ts` (cn), clsx, tailwind-merge, cva, tailwindcss-animate, lucide-react
- **#1 Tableau de bord** (mergé) : contenu dans `components/dashboard/` (KPI ×4, graphique CA 8 mois barres empilées CSS, panneau « À traiter », factures récentes, top clients) ; données mockées dans `components/dashboard/mock-data.ts`. Primitives ajoutées : `components/ui/button.tsx` (Button shadcn Slot+cva mappé sur les tokens) et `components/icons/currency-icon.tsx` (seule icône custom ; le reste via lucide-react)
- **#2 Landing + pages légales** (mergé) : `app/(public)/page.tsx` (landing, devient `/`) + `app/(public)/legal/page.tsx` (3 docs légaux navigables par hash) ; composants `components/public/` (nav, footer, legal-docs). Bande CTA figée sombre dans les 2 thèmes. Liens `/connexion` `/inscription` en `prefetch={false}` (routes créées en #3). Texte légal : hébergement Supabase `eu-central-1 (Francfort)`

- **#4 BDD** (mergé) : 5 tables Supabase (`users`, `clients`, `projects`, `documents`, `document_lines`) via migration SQL versionnée `supabase/migrations/`, **RLS `user_id = auth.uid()` active + policée sur chacune** (vérifié), trigger `on_auth_user_created` → crée le profil `public.users`. Montants en **centimes entiers**, **TVA par ligne**, `user_id` sur chaque table, unicité `(user_id, number)`, RESTRICT transitif clients←projects←documents. Schéma dans `prisma/schema.prisma`. **Rappel** : Prisma bypasse la RLS → toujours filtrer `where: { userId }` dans le code applicatif. À arbitrer en #5 : champs « Nouveau client » (forme juridique, contact, CP/ville, taux TVA défaut) non encore modélisés.

- **#3 Auth** (mergé) : Supabase Auth (email/mot de passe) + 4 écrans `app/(public)/` (connexion, inscription, mot-de-passe-oublié, réinitialisation) ; infra `lib/supabase/` (clients SSR browser+server) + `middleware.ts` (protège le groupe app → non-auth redirigé vers /connexion, déjà-connecté hors des pages auth) + `lib/auth/` (server actions signIn/signUp/signOut/requestPasswordReset/updatePassword validées zod ; `requireUserId()` à utiliser dans les futures requêtes Prisma). Bouton Google = placeholder désactivé. Isolation RLS vérifiée en conditions réelles. **Confirmation e-mail : OFF en dev / ON en prod via 2 projets Supabase séparés (#17)** — le projet actuel = dev (mettre Confirm email OFF au dashboard).

### 🔜 À faire — une issue GitHub par user story, branche liée `feat/<num>-<slug>` déjà créée
5. **#5** CRUD Clients — `feat/5-crud-clients` (dépend #4)
6. **#6** CRUD Projets — `feat/6-crud-projets` (dépend #5)
7. **#7** Listes Devis/Factures + vue Document — `feat/7-devis-factures` (dépend #4)
8. **#8** Éditeur de document (A4 + TVA) — `feat/8-editeur-document` (dépend #4, #7)
9. **#9** PDF serveur Puppeteer — `feat/9-pdf-puppeteer` (dépend #8)
10. **#10** Paywall freemium + Abonnement — `feat/10-paywall-abonnement` (dépend #4)
11. **#11** Rapports — `feat/11-rapports` (dépend #4, #10)
12. **#12** Paramètres — `feat/12-parametres` (dépend #3, #4)

### Mocks à remplacer plus tard par Prisma
- Badges nav sidebar (24 clients, 8 projets, 5 devis, 12 factures)
- Jauge freemium 4/5 (composant `UsageGauge` déjà paramétré `used/limit`)
- User-chip « Camille Laurent »

## Workflow Git

Pour toute fonctionnalité/correctif, utiliser le skill **`/issue-flow <description>`** (`.claude/skills/issue-flow/SKILL.md`) : il crée l'issue GitHub, la branche liée (`feat/<num>-<slug>`), implémente, vérifie le build, ouvre la PR (`Closes #<num>`) et merge en squash. Repo : `Aure33/FreelanceFlow`, `gh` CLI authentifié.

## Équipe d'agents (`.claude/agents/`)

| Agent | Domaine | Quand |
|---|---|---|
| `frontend-ui` | Écrans/composants pixel-perfect depuis les maquettes, tokens, a11y | Toute UI |
| `backend-data` | Prisma, Supabase, RLS, auth, server actions, requêtes | Toute donnée/sécurité |
| `invoicing-pdf` | Calculs TVA (centimes !), régimes/mentions légales, numérotation, A4, PDF Puppeteer | Tout le métier facturation |
| `qa-verifier` | Vérification critique (Playwright, maquettes, a11y, sécu, éco) — rapporte, ne corrige pas | Après chaque feature, avant PR |

L'agent principal orchestre, garde la structure du projet et le workflow Git (issues/PR/merge).

## Vérification navigateur

Skill **`/playwright-verify [route]`** (`.claude/skills/playwright-verify/SKILL.md`) : teste chaque feature dans Chromium headless (playwright installé en devDependency) — screenshots clair/sombre comparés aux maquettes, interactions, erreurs console, port dédié 3199. Étape obligatoire d'issue-flow avant PR. Si Chromium ne se lance pas (libs système WSL manquantes) : `sudo ~/.bun/bin/bunx playwright install-deps chromium`.

## Conventions

- **Langue** : UI et commentaires en français (copies exactes des maquettes)
- **Tokens uniquement** : jamais de couleur en dur — utiliser les classes mappées (`bg-surface`, `text-ink-2`, `border-line`, `bg-accent-soft`, `text-accent-ink`, `bg-ok-soft`…). Thème sombre automatique via les variables CSS
- **Classes layout dispo** : `h-topbar` (64px), `w-sidebar`/`grid-cols-[var(--sidebar-w)_1fr]` (248px), `p-pad` (22px), `gap-gap` (20px), `max-w-content` (1320px), padding contenu = `p-7` (28px)
- **Rayons** : `rounded-sm`=7px, `rounded-md`=10px, `rounded-lg`=14px, `rounded-xl`=20px (écrasent les valeurs Tailwind par défaut)
- **Montants/compteurs** : classe utilitaire `.num` (JetBrains Mono + tabular-nums)
- **Icônes** : lucide-react, `strokeWidth={1.9}` dans la nav, 2 ailleurs (cf. maquettes)
- **Statuts** : tag pills — ok (payé), warn (en attente), danger (en retard), neutral (brouillon), accent (envoyé) — cf. tableau section 10 du README design
- **Composants** : shell dans `components/layout/`, futurs composants shadcn dans `components/ui/`, métier dans `components/<domaine>/`
- **Sécurité (non négociable RNCP)** : RLS sur chaque table + `where: { userId: session.user.id }` sur chaque requête Prisma ; PDF généré côté serveur uniquement ; secrets dans `.env.local`
- **Éco-conception** : `select` Prisma explicites + pagination, composants lourds en `next/dynamic`, `next/image`, fonts `display: swap`

## Accessibilité (exigée)

Labels explicites liés (`for`/`id`), modales `role="dialog"` + `aria-modal` + focus trap + Échap, graphiques `role="img"` + `aria-label`, cartes radio `role="radiogroup"`, contrastes ≥ 4.5:1 dans les deux thèmes, navigation clavier complète, `prefers-reduced-motion` respecté.
