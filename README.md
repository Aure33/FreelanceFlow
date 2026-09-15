# Freelance Flow

**Devis, factures conformes, relances et suivi du chiffre d'affaires pour les travailleurs indépendants.**

Un indépendant qui facture jongle souvent entre trois outils : un tableur pour le devis, un traitement de texte pour la facture, sa boîte mail pour la relance. Freelance Flow réunit la chaîne complète — client, projet, devis, facture, encaissement — dans une seule application, avec une promesse simple : **produire un devis ou une facture conforme en moins de deux minutes**, TVA calculée au centime et mentions légales comprises.

> **Projet de démonstration** réalisé par Aurélien Jesson-Daniel dans le cadre du titre RNCP 39583 « Expert en développement logiciel » (Ynov). L'application est déployée et fonctionnelle, mais non commercialisée : le paiement fonctionne en environnement de test Stripe, sans aucun prélèvement réel.
>
> **Application en ligne :** https://freelance-flow-wine.vercel.app

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Sécurité et données personnelles](#sécurité-et-données-personnelles)
- [Qualité](#qualité)
- [Démarrer en local](#démarrer-en-local)
- [Scripts](#scripts)
- [Déploiement](#déploiement)
- [Limites connues](#limites-connues)

---

## Fonctionnalités

### Facturation
- **Clients** identifiés par leur SIRET, vérifié et prérempli en direct via l'API publique Recherche d'entreprises.
- **Projets** rattachés à un client, en vue grille ou kanban, avec leurs agrégats financiers (budget, facturé, encaissé, reste à facturer).
- **Éditeur de devis et de factures** avec aperçu A4 en temps réel :
  - montants stockés en **centimes entiers**, TVA **par ligne** et arrondi commercial ;
  - trois régimes de TVA (franchise en base, réel simplifié, réel normal) et mentions légales ajoutées automatiquement (art. 293 B du CGI, pénalités et indemnité de 40 € de l'art. L441-10 du Code de commerce) ;
  - **numérotation légale** séquentielle `FAC-2026-001` / `DEV-2026-001`, attribuée à l'émission seulement (un brouillon n'a pas de numéro).
- **PDF** généré côté serveur, identique à l'écran.
- **Envoi par e-mail** avec le PDF en pièce jointe ; pour un devis, un **lien d'acceptation en ligne** permet au client d'accepter ou de refuser sans créer de compte.
- **Conversion d'un devis accepté en facture** en un clic, duplication de pièces, annulation d'un statut.
- **Relances automatiques** des factures échues (tâche quotidienne, trois paliers et trois tons au choix).
- **Logo** de l'entreprise sur les documents.

### Pilotage
- **Tableau de bord** : chiffre d'affaires encaissé, en attente, en retard, devis à relancer, graphe sur 8 mois, priorités du jour — tout est cliquable.
- **Rapports** : indicateurs par période (année, 12 mois glissants, trimestre), répartition du CA et délais de paiement par client, export PDF.
- **Recherche globale** (`⌘K` / `Ctrl+K`) et notifications.

### Compte et abonnement
- Inscription par e-mail ou Google, réinitialisation du mot de passe, changement d'adresse e-mail.
- **Forfait gratuit** limité à 5 documents émis par mois ; **forfait Premium** via Stripe Checkout (environnement de test).
- **Export des données** au format JSON et **suppression définitive du compte** (droits d'accès, de portabilité et d'effacement du RGPD).

### Interface
- Responsive (utilisable sur téléphone), thème clair et sombre, navigation complète au clavier.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 14 (App Router, server actions), React 18, TypeScript |
| Interface | Tailwind CSS 3, composants shadcn/ui, icônes Lucide |
| Données et authentification | Supabase (PostgreSQL, Auth, Storage) avec Row Level Security |
| Accès aux données | Prisma 6 |
| Validation | Zod |
| PDF | Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) |
| Paiement | Stripe Checkout et webhooks signés (mode test) |
| E-mail | Resend |
| Supervision | Sentry (erreurs uniquement) |
| Tests | `bun test` (unitaires et intégration), Playwright (bout en bout), axe-core |
| Hébergement | Vercel (région Dublin) |
| Environnement | Bun |

---

## Architecture

```
app/
├── (public)/            Pages publiques : accueil, connexion, inscription,
│                        mentions légales, page d'acceptation de devis (/proposition)
├── (app)/               Application authentifiée : tableau de bord, clients, projets,
│   │                    devis, factures, rapports, abonnement, paramètres
│   └── */actions.ts     Server actions : session, validation Zod, filtre utilisateur
└── api/                 Routes serveur : PDF, webhook Stripe, tâche de relance, keep-alive
components/              Composants d'interface, rangés par domaine
lib/
├── invoicing/           Cœur métier pur : montants, TVA, numérotation, mentions, dates
├── pdf.ts               Rendu PDF (Puppeteer)
├── reminders.ts         Règles des relances (pures) — reminder-sweep.ts les exécute
└── supabase/, auth/     Clients Supabase et session
prisma/schema.prisma     Modèle de données
supabase/migrations/     Migrations SQL versionnées (schéma, règles RLS, stockage)
tests/
├── integration/         Server actions contre une vraie base de test, isolation entre comptes
└── e2e/                 Parcours réels dans Chromium
scripts/                 Audits rejouables (accessibilité, éco-conception) et test de fumée
docs/ecoindex.md         Rapport d'éco-conception
```

**Modèle de données** — une hiérarchie stricte `utilisateur → client → projet → document → lignes`. Chaque table porte l'identifiant de l'utilisateur.

**Génération du PDF** — le moteur de rendu navigue vers la vraie page du document, avec la session de l'utilisateur, et l'imprime. Il n'existe donc qu'une seule source de vérité visuelle : ce que l'utilisateur voit à l'écran est exactement ce que le client reçoit.

---

## Sécurité et données personnelles

- **Isolation entre comptes, en deux barrières** : une politique Row Level Security sur chaque table, et un filtre explicite sur l'utilisateur dans chaque requête applicative — Prisma se connectant avec un rôle privilégié, c'est ce filtre qui fait foi. Chaque action serveur est couverte par un test d'isolation à deux comptes.
- **Paiement** : le forfait Premium n'est accordé que par un webhook Stripe dont la signature est vérifiée sur le corps brut de la requête. Aucune donnée bancaire n'est stockée.
- **Lien public de devis** : jeton aléatoire de 24 octets, révocable, qui n'autorise que la consultation et la réponse au devis.
- **Fichiers** : stockage privé, cloisonné par utilisateur, affiché par URL signée à durée limitée.
- **En-têtes HTTP** : `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Secrets** : jamais dans le dépôt — `.env.local` en local, variables d'environnement Vercel en production.
- **Données personnelles** : base et fichiers hébergés dans l'Union européenne, aucun traceur publicitaire ni mesure d'audience, export et suppression du compte en libre-service.

---

## Qualité

- **Intégration continue bloquante** (GitHub Actions) : vérification du code, compilation avec budget de poids par page, puis tests unitaires, d'intégration et de bout en bout. Une fusion sur `main` exige les cinq contrôles au vert.
- **Tests** :
  - unitaires sur les modules de calcul purs, couverts à 100 % ;
  - d'intégration sur les server actions, contre une vraie base de test, dont l'isolation entre comptes ;
  - de bout en bout sur les parcours réels dans un navigateur.
- **Accessibilité** : audit axe-core rejouable (critères WCAG 2.1 A et AA) sur les pages clés, dans les deux thèmes.
- **Éco-conception** : audit EcoIndex rejouable et budget de poids JavaScript contrôlé à chaque compilation — voir [`docs/ecoindex.md`](docs/ecoindex.md).

---

## Démarrer en local

**Prérequis** : [Bun](https://bun.sh) et un projet [Supabase](https://supabase.com) (les migrations se trouvent dans `supabase/migrations/`).

```bash
bun install
cp .env.example .env.local   # puis renseigner les variables ci-dessous
bun run dev                  # http://localhost:3000
```

### Variables d'environnement

| Variable | Rôle | Requise |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | oui |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique Supabase | oui |
| `SUPABASE_SECRET_KEY` | Clé secrète Supabase (serveur uniquement) | oui |
| `DATABASE_URL` | Connexion PostgreSQL via le pooler (application) | oui |
| `DIRECT_URL` | Connexion PostgreSQL directe (migrations) | oui |
| `NEXT_PUBLIC_SITE_URL` | URL publique de secours pour les liens envoyés par e-mail | non |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (mode test) | paiement |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature du webhook Stripe | paiement |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | Identifiants des tarifs Premium | paiement |
| `RESEND_API_KEY` | Clé de l'API Resend | envoi d'e-mails |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN Sentry | supervision |
| `CRON_SECRET` | Secret de la tâche planifiée de relance | relances |

Sans les variables optionnelles, l'application démarre et la fonction concernée est simplement indisponible.

---

## Scripts

| Commande | Effet |
|---|---|
| `bun run dev` | Serveur de développement |
| `bun run build` / `bun run start` | Compilation et serveur de production |
| `bun run lint` | Vérification du code |
| `bun test` | Tests unitaires |
| `bun run test:coverage` | Tests unitaires avec couverture |
| `bun run test:integration` | Tests d'intégration (base de test requise) |
| `bunx playwright test` | Tests de bout en bout |
| `bun run audit:a11y` | Audit d'accessibilité axe-core |
| `bun scripts/eco/audit.ts` | Audit d'éco-conception EcoIndex |
| `SMOKE_BASE_URL=<url> bun --env-file=.env.production scripts/smoke/pdf-prod.ts` | Test de fumée du PDF sur l'environnement déployé |

---

## Déploiement

- **Vercel** déploie automatiquement chaque fusion sur `main`. Les fonctions serveur tournent en région Dublin, au plus près de la base.
- **Deux projets Supabase** séparés : développement (tests automatisés, confirmation d'e-mail désactivée) et production.
- **Migrations** versionnées dans `supabase/migrations/`, appliquées sur les deux environnements.
- **Tâche planifiée quotidienne** (Vercel Cron) pour les relances, protégée par `CRON_SECRET`.

---

## Limites connues

- **Facturation électronique** : l'application émet des PDF classiques, pas encore au format Factur-X exigé pour l'émission par les TPE et PME à partir du 1er septembre 2027.
- **Factures d'avoir** non implémentées : une facture émise ne se supprime pas, elle devrait se corriger par un avoir.
- **Authentification** : pas de second facteur ; politique de mot de passe à renforcer.
- **Politique de sécurité du contenu** (CSP) non encore définie.
- **Tenue en charge** non mesurée.

---

## Auteur

**Aurélien Jesson-Daniel** — projet réalisé dans le cadre du titre RNCP 39583 « Expert en développement logiciel », Ynov.
