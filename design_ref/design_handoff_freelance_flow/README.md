# Handoff : Freelance Flow — SaaS de facturation pour indépendants

## Vue d'ensemble

Freelance Flow est un SaaS B2B de gestion d'activité pour travailleurs indépendants. Sa proposition de valeur centrale est de permettre la génération d'un devis ou d'une facture PDF conforme (TVA, mentions légales) **en moins de 2 minutes et 3 clics**.

Ce package contient **21 maquettes HTML haute-fidélité** représentant l'intégralité du périmètre MVP. Il s'agit de **prototypes de référence design**, pas de code production à copier : la mission est de **recréer ces écrans dans le projet Next.js** en utilisant les bibliothèques et conventions définies ci-dessous.

---

## Stack cible

| Couche | Technologie |
|---|---|
| Framework | **Next.js 14** (App Router, SSR/SSG) |
| Styling | **Tailwind CSS** + composants **Shadcn/ui** |
| Auth & BDD | **Supabase** (PostgreSQL + RLS + Storage) |
| ORM | **Prisma** |
| PDF | **Puppeteer** (route API côté serveur) |
| Déploiement | **Vercel** |

---

## Fidelité des maquettes

**Haute-fidélité (hifi)** : couleurs, typographie, espacements, ombres, états hover/focus, animations et copies sont finalisés. Recréez l'UI pixel-perfect en utilisant les tokens du design system listés dans la section « Design Tokens ».

---

## Architecture des pages Next.js (App Router)

```
app/
├── (public)/
│   ├── page.tsx                  ← Accueil.html
│   ├── connexion/page.tsx        ← Connexion.html
│   ├── inscription/page.tsx      ← Inscription.html
│   ├── mot-de-passe-oublie/      ← Mot de passe oublié.html
│   │   └── page.tsx
│   ├── reinitialisation/         ← Réinitialisation.html
│   │   └── page.tsx
│   └── legal/page.tsx            ← Pages légales.html
├── (app)/
│   ├── layout.tsx                ← Shell sidebar + topbar (partagé)
│   ├── dashboard/
│   │   ├── page.tsx              ← Tableau de bord.html
│   │   └── onboarding/page.tsx   ← Premier lancement.html
│   ├── clients/
│   │   ├── page.tsx              ← Clients.html
│   │   ├── nouveau/page.tsx      ← Nouveau client.html
│   │   └── [id]/page.tsx         ← Fiche client.html
│   ├── projets/
│   │   ├── page.tsx              ← Projets.html
│   │   └── [id]/page.tsx         ← Projet détail.html
│   ├── devis/
│   │   ├── page.tsx              ← Devis.html
│   │   └── [id]/page.tsx         ← Document.html (type=devis)
│   ├── factures/
│   │   ├── page.tsx              ← Factures.html
│   │   └── [id]/page.tsx         ← Document.html (type=facture)
│   ├── documents/
│   │   └── nouveau/page.tsx      ← Nouvelle facture.html
│   ├── rapports/page.tsx         ← Rapports.html
│   ├── abonnement/page.tsx       ← Abonnement.html
│   └── parametres/page.tsx       ← Profil.html
```

---

## Design Tokens (Tailwind config + CSS variables)

> Ces tokens sont définis dans `styles/freelance-flow.css`. Configurez-les dans `tailwind.config.ts` et `globals.css`.

### Couleurs (oklch)

```css
/* globals.css — :root (thème clair) */
--bg:          oklch(0.985 0.004 95);   /* fond app */
--surface:     oklch(1 0 0);            /* cartes */
--surface-2:   oklch(0.975 0.005 95);   /* hover, zones internes */
--line:        oklch(0.915 0.005 95);   /* bordures */
--line-soft:   oklch(0.945 0.004 95);   /* séparateurs */

--ink:         oklch(0.23 0.012 75);    /* texte principal */
--ink-2:       oklch(0.45 0.012 75);    /* texte secondaire */
--ink-3:       oklch(0.60 0.010 75);    /* labels, tertiaire */

--accent:      oklch(0.48 0.14 264);    /* indigo */
--accent-hover:oklch(0.42 0.145 264);
--accent-soft: oklch(0.95 0.035 264);
--accent-ink:  oklch(0.40 0.15 264);
--on-accent:   oklch(0.99 0.01 264);

--ok:          oklch(0.55 0.11 155);    /* vert — payé */
--ok-soft:     oklch(0.95 0.04 155);
--ok-ink:      oklch(0.42 0.10 155);
--warn:        oklch(0.66 0.12 75);     /* orange — en attente */
--warn-soft:   oklch(0.95 0.05 80);
--warn-ink:    oklch(0.46 0.10 70);
--danger:      oklch(0.55 0.16 25);     /* rouge — en retard */
--danger-soft: oklch(0.955 0.03 25);
--danger-ink:  oklch(0.48 0.16 25);
```

### Thème sombre — `[data-theme="dark"]` sur `<html>`

```css
--bg:        oklch(0.185 0.006 75);
--surface:   oklch(0.225 0.007 75);
--surface-2: oklch(0.265 0.008 75);
--line:      oklch(0.32 0.010 75);
--ink:       oklch(0.93 0.006 95);
--ink-2:     oklch(0.76 0.009 95);
--accent:    oklch(0.60 0.13 264);
/* ... voir styles/freelance-flow.css pour la liste complète */
```

### Typographie

```
Font principale : Schibsted Grotesk (Google Fonts) — 400, 500, 600, 700, 800
Font monospace  : JetBrains Mono — 400, 500, 600
```

### Rayons

```
--r-sm: 7px  | --r-md: 10px  | --r-lg: 14px  | --r-xl: 20px
```

### Ombres

```css
--shadow-sm: 0 1px 2px oklch(0.4 0.02 75 / 0.05), 0 1px 1px oklch(0.4 0.02 75 / 0.04);
--shadow-md: 0 4px 16px oklch(0.4 0.02 75 / 0.06), 0 1px 3px oklch(0.4 0.02 75 / 0.05);
--shadow-lg: 0 12px 40px oklch(0.4 0.02 75 / 0.10), 0 2px 8px oklch(0.4 0.02 75 / 0.05);
```

### Layout

```
Sidebar width : 248px
Topbar height : 64px
Content padding : 28px
Gap cards : 20px
```

---

## Modèle de données (PostgreSQL / Prisma)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  siret     String?
  tvaRegime String   @default("reel") // franchise | reel | normal
  planType  String   @default("free") // free | premium
  clients   Client[]
  createdAt DateTime @default(now())
}

model Client {
  id       String    @id @default(uuid())
  userId   String
  user     User      @relation(fields: [userId], references: [id])
  name     String
  siren    String?
  email    String?
  address  String?
  projects Project[]
  // ON DELETE RESTRICT : ne peut pas supprimer un client avec des factures
}

model Project {
  id        String    @id @default(uuid())
  clientId  String
  client    Client    @relation(fields: [clientId], references: [id])
  name      String
  status    String    @default("en_cours") // en_cours | termine | en_pause
  documents Document[]
}

model Document {
  id         String   @id @default(uuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id])
  type       String   // devis | facture
  number     String   @unique  // FAC-2026-001
  status     String   // brouillon | envoye | accepte | refuse | paye | en_retard
  amountHT   Float
  tvaRate    Float    @default(20)
  amountTTC  Float
  issuedAt   DateTime
  dueAt      DateTime?
  paidAt     DateTime?
}
```

**Règle RLS Supabase critique** (à appliquer sur toutes les tables) :
```sql
CREATE POLICY "isolation_user" ON clients
  FOR ALL USING (user_id = auth.uid());
```

---

## Écrans — description détaillée

### 1. Shell applicatif (layout partagé)
**Fichier** : `Tableau de bord.html`
**Composants** :
- **Sidebar** (248px, fixe) : logo + nav items + nav-label + jauge freemium + user-chip
- **Topbar** (64px, sticky, backdrop-blur) : titre de page + barre de recherche (280px) + icône notifs
- **Jauge freemium** (sidebar-foot, au-dessus du user-chip) : affiche `X / 5 documents ce mois`, barre de progression colorée en `--warn` ou `--danger` selon remplissage, lien vers `/abonnement`

**Nav items** :
| Label | Icône | Route | Badge |
|---|---|---|---|
| Tableau de bord | grid | /dashboard | — |
| Clients | users | /clients | nb clients |
| Projets | layers | /projets | nb projets |
| *(label)* Facturation | | | |
| Devis | file-text | /devis | nb devis |
| Factures | receipt | /factures | nb factures |
| *(label)* Pilotage | | | |
| Rapports | bar-chart | /rapports | — |
| Abonnement | credit-card | /abonnement | — |
| Paramètres | settings | /parametres | — |

**État actif** : `background: var(--accent-soft); color: var(--accent-ink); font-weight: 600`

---

### 2. Tableau de bord
**Fichier** : `Tableau de bord.html`

**KPI grid** (4 colonnes) : CA du mois (€ HT), En attente de paiement, Devis en cours, Factures en retard. Chaque KPI a une icône colorée (indigo/vert/orange/rouge), une valeur en font-size 27px, un delta comparé au mois précédent.

**Graphique CA** (barres empilées) : 12 mois, barres `paid` en `--accent`, barres `pending` en `--accent-soft`. Hauteur des barres calculée proportionnellement au max du dataset.

**Paneau latéral droit** (380px) : dernières factures (liste) + devis à relancer.

**Bandeau bas** (3 colonnes) : progression vers objectif mensuel, répartition CA par client (barres horizontales), prochaines échéances.

---

### 3. Premier lancement (onboarding)
**Fichier** : `Premier lancement.html`

S'affiche quand `clients.count === 0 && documents.count === 0`.

Checklist 3 étapes avec progression :
1. Renseigner SIRET + régime TVA → `/parametres`
2. Créer premier client → `/clients/nouveau`
3. Émettre premier document → `/documents/nouveau`

Chaque étape : numéro dans cercle, titre, description, durée estimée, bouton CTA. Étape courante surlignée en accent.

---

### 4. Clients
**Fichier** : `Clients.html`

Table avec colonnes : Nom, Secteur, Dernier document, CA total, Solde en attente, Actions.
Filtres par chips (Tous, Actifs, Archivés).
Bouton « Nouveau client » → `/clients/nouveau`.
Clic sur ligne → `/clients/[id]`.

---

### 5. Nouveau client
**Fichier** : `Nouveau client.html`

Formulaire en 2 colonnes :
- Nom de l'entreprise + SIREN (avec validation SIRENE asynchrone : badge « ✓ Vérifié » en vert)
- E-mail, téléphone, adresse, secteur d'activité, conditions de paiement par défaut
- Zone RIB (optionnel)

Validation SIRET : regex `^\d{9}$` + appel API INSEE/SIRENE.

---

### 6. Fiche client
**Fichier** : `Fiche client.html`

En-tête : initiales dans carré coloré, nom, secteur, KPI rapides (CA total, en attente, nb projets).
3 colonnes : coordonnées + infos légales | liste des projets | liste des documents récents.
Boutons « Modifier » → ouvrent un drawer d'édition (inerte en maquette, à implémenter).

---

### 7. Projets
**Fichier** : `Projets.html`

Grille de cartes + vue tableau (toggle segment). Chaque carte : nom du projet, client, statut (badge), avancement (barre), montant, date de dernière activité.

---

### 8. Projet détail
**Fichier** : `Projet détail.html`

En-tête : logo client, nom du projet, statut, KPI financiers (budget, facturé, reste à facturer).
Timeline des phases (dots : done/now/todo).
Onglets : Documents | Notes | Activité.

---

### 9. Nouvelle facture (éditeur)
**Fichier** : `Nouvelle facture.html`

**Layout** : 2 colonnes — formulaire (gauche) + aperçu A4 en temps réel (droite).

**Formulaire (4 sections)** :
1. **En-tête** : type (devis/facture), client (autocomplete), numéro auto-calculé
2. **Lignes** : tableau de prestations avec colonnes Désignation / Qté / Prix unit HT / TVA / Total HT. Bouton « + Ajouter une ligne ». Calcul TVA en temps réel.
3. **Conditions** : date d'émission, échéance, conditions de paiement, note optionnelle
4. **Mentions légales** : auto-injectées selon le régime TVA (franchise → art.293B CGI, réel → taux 20%)

**Aperçu A4** : synchronisé en temps réel. Le document (595×842px) reste avec `background: #fff` quel que soit le thème. CTA : « Enregistrer en brouillon » + « Émettre et télécharger le PDF ».

**Calcul TVA** :
```
totalHT = sum(qty × prix_unit)
montantTVA = totalHT × (tvaRate / 100)   // 0 si franchise
totalTTC = totalHT + montantTVA
```

---

### 10. Factures (liste)
**Fichier** : `Factures.html`

Bandeau de synthèse (3 tuiles) : Encaissé / En attente / En retard.
Filtres par chips : Toutes / Payées / En attente / En retard / Brouillons.
Table : Pièce | Client | Objet | Émise le | Échéance (rouge si dépassée) | Statut | Montant TTC | Actions (PDF, Relancer).
Clic ligne → `/factures/[id]`.

**Statuts et couleurs** :
| Statut | Classe CSS | Couleur |
|---|---|---|
| Payée | `tag.ok` | `--ok-soft` / `--ok-ink` |
| En attente | `tag.warn` | `--warn-soft` / `--warn-ink` |
| En retard | `tag.danger` | `--danger-soft` / `--danger-ink` |
| Brouillon | `tag.neutral` | `--surface-2` / `--ink-2` |
| Envoyé (devis) | `tag.accent` | `--accent-soft` / `--accent-ink` |

---

### 11. Limite atteinte (paywall)
**Fichier** : `Limite atteinte.html`

Déclenché quand `documents_this_month >= 5 && plan === 'free'`.

**Comportement** : la modale s'ouvre automatiquement quand l'utilisateur clique « Nouvelle facture ». Le bouton de création ne navigue plus vers l'éditeur.

**Modale** (`role="dialog"`, `aria-modal="true"`) :
- Icône warning
- Titre + compteur 5/5 (barre rouge 100%)
- 3 bénéfices Premium avec checkmarks verts
- CTA primaire → `/abonnement`
- Lien secondaire « Attendre le 1ᵉʳ juillet »
- Fermeture : clic hors modale, touche Échap
- `prefers-reduced-motion` : transitions désactivées

**Page derrière** : bannière d'avertissement + jauge sidebar 5/5 rouge.

---

### 12. Document (visualisation PDF)
**Fichier** : `Document.html`

Le document A4 (595px, fond blanc fixe) s'affiche à gauche. Panneau droit : statut + timeline + actions (Envoyer, Marquer comme payé, Relancer, Dupliquer, Archiver).

**Structure du document A4** :
- En-tête : infos émetteur (gauche) + type+numéro+date (droite)
- Métadonnées : date d'émission, échéance, conditions de paiement
- Bloc client (fond `oklch(0.975 0.005 95)`)
- Tableau des prestations
- Bloc totaux : HT, TVA (taux et montant), **Total TTC en gras accent**
- Pied de page : coordonnées bancaires (IBAN/BIC) + mentions légales

---

### 13. Abonnement
**Fichier** : `Abonnement.html`

**Section 1 — Forfait actuel** : nom du plan + badge « Plan actuel », date d'inscription, prix.
**Section 2 — Jauges de consommation** : Documents ce mois (X/5, barre orange si >80%), Clients (illimités), Relances (manuelles/auto).
**Section 3 — Comparatif** : 2 cartes côte à côte (Gratuit vs Premium). Toggle Mensuel/Annuel (−20%). Le plan Premium a une bordure accent + badge « Recommandé ».
**Section 4 — Historique** : table des reçus (vide sur Gratuit).

**Logique Mensuel/Annuel** :
```js
mensuel → 15 €/mois
annuel  → 12 €/mois (facturé 144 €/an)
```

---

### 14. Rapports
**Fichier** : `Rapports.html`

**Accessible uniquement en Premium pour les stats avancées.**

KPI : CA encaissé YTD, En attente, Délai moyen paiement, Taux d'acceptation devis.
Graphique CA (barres, identique au dashboard) : disponible sur tous les plans.

**2 cartes floutées (Premium)** avec overlay verrou :
- Répartition CA par client (barres horizontales)
- Délais de paiement par client

Overlay : `filter: blur(5px)` sur `.card-body` + `position: absolute` avec icône cadenas + CTA upgrade.

---

### 15. Paramètres
**Fichier** : `Profil.html`

Navigation latérale sticky avec ancres : Identité | Informations légales | Régime de TVA | Coordonnées bancaires | Préférences de facturation | Relances automatiques | Apparence | Compte.

**Section Identité** : avatar (initiales) + zone drag-drop logo (PNG/SVG), formulaire nom/activité/téléphone/adresse.

**Section Régime TVA** : 3 cartes radio (Franchise / Réel simplifié / Réel normal). La sélection change les mentions auto sur les documents.

**Section Relances automatiques** (Premium) :
- Toggle switch (activation)
- 3 selects : J+7, J+15, J+30
- Segment ton (Courtois / Neutre / Ferme)
- Aperçu du message mis à jour dynamiquement
- Note Premium

**Section Apparence** :
- 2 cartes radio : Clair / Sombre
- Au clic → `ffTheme.set('light'|'dark')` + `localStorage['ff-theme']`

**Section Compte** : bouton Déconnexion + zone danger rouge.

---

### 16. Pages légales
**Fichier** : `Pages légales.html`

Navigation par hash : `#mentions`, `#cgu`, `#confidentialite`.
Chaque section s'affiche via `document.getElementById('doc-'+name).classList.add('visible')`.
Aucun rechargement de page.

---

### 17. Auth (Connexion / Inscription / MDP oublié / Réinitialisation)
**Fichiers** : `Connexion.html`, `Inscription.html`, `Mot de passe oublié.html`, `Réinitialisation.html`

Layout 2 colonnes : formulaire (droite) + illustration schématique (gauche, fond accent).

**Flux MDP oublié** :
1. `Connexion` → clic « Mot de passe oublié ? » → `Mot de passe oublié.html`
2. Saisie e-mail → état « E-mail envoyé » (même page, masquage du formulaire)
3. Clic lien dans l'e-mail → `Réinitialisation.html`
4. Saisie + confirmation → validation en temps réel (règles : 8 car., 1 chiffre, match) → redirection `Connexion`

**Supabase Auth** :
```ts
// Demande de réinitialisation
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/reinitialisation`
});

// Mise à jour du mot de passe
await supabase.auth.updateUser({ password: newPassword });
```

---

## Interactions et comportements clés

| Interaction | Comportement attendu |
|---|---|
| Calcul TVA | Temps réel à chaque frappe dans l'éditeur |
| Validation SIRET | Appel API SIRENE asynchrone, badge vert/rouge |
| Toggle thème | `data-theme` sur `<html>`, persisté en `localStorage['ff-theme']`, appliqué avant premier rendu (script inline dans `<head>`) |
| Paywall 5/5 | Intercepte le clic « Nouvelle facture », ouvre modale, Échap/clic extérieur ferme |
| Relances — aperçu ton | Change le texte du bloc aperçu sans rechargement |
| Toggle Mensuel/Annuel | Met à jour `15 €` → `12 €` et la note de facturation |
| Navigation légales | Hash URL, scroll to top, pas de rechargement |
| Onboarding | Affiché si `clients.count === 0 && documents.count === 0` |

---

## Accessibilité (RGAA / WCAG AA)

- Tous les formulaires : `<label>` explicites + `for`/`id` liés
- Modale : `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Échap
- Graphiques : `role="img"` + `aria-label` décrivant les données
- Cartes radio TVA/thème : `role="radiogroup"` + `aria-checked`
- Contrastes : tous les textes ≥ 4.5:1 sur fond clair **et** fond sombre
- Navigation clavier : tous les éléments interactifs atteignables au Tab

---

## Sécurité (non-négociable pour l'évaluation RNCP)

- **RLS Supabase** : politique sur chaque table — `user_id = auth.uid()`
- **Prisma** : utiliser `where: { userId: session.user.id }` sur chaque requête — jamais de requête globale
- Mots de passe : bcrypt via Supabase Auth (jamais stockés en clair)
- PDF généré côté serveur (route API Next.js + Puppeteer) — jamais côté client
- Variables d'env : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` dans `.env.local`

---

## Éco-conception (objectif EcoIndex ≥ B)

- Architecture Serverless (Vercel Functions) : pas de serveur tournant à vide
- Requêtes Prisma ciblées : `select` explicites, pas de `findMany` sans pagination
- Lazy loading : composants lourds (éditeur de facture, graphiques) en `next/dynamic`
- Images optimisées : `next/image`
- Fonts : `next/font/google` avec `display: swap`

---

## Fichiers de référence inclus dans ce package

| Fichier | Écran |
|---|---|
| `Accueil.html` | Landing page publique |
| `Connexion.html` | Login |
| `Inscription.html` | Signup |
| `Mot de passe oublié.html` | Demande de réinitialisation |
| `Réinitialisation.html` | Saisie du nouveau mot de passe |
| `Tableau de bord.html` | Dashboard principal |
| `Premier lancement.html` | Onboarding état vide |
| `Clients.html` | Liste des clients |
| `Nouveau client.html` | Formulaire création client |
| `Fiche client.html` | Détail client |
| `Projets.html` | Liste des projets |
| `Projet détail.html` | Détail projet |
| `Devis.html` | Liste des devis |
| `Factures.html` | Liste des factures |
| `Nouvelle facture.html` | Éditeur de document |
| `Document.html` | Visualisation / PDF |
| `Limite atteinte.html` | Paywall freemium |
| `Rapports.html` | Statistiques d'activité |
| `Abonnement.html` | Gestion de l'abonnement |
| `Profil.html` | Paramètres utilisateur |
| `Pages légales.html` | Mentions / CGU / RGPD |
| `styles/freelance-flow.css` | Design system complet (tokens, composants) |
| `scripts/theme.js` | Toggle dark/light mode |

---

## Comment utiliser ce package avec Claude Code

1. Décompressez ce zip dans un dossier `design_ref/` à la racine de votre projet Next.js
2. Ouvrez VS Code dans votre projet
3. Démarrez Claude Code dans le terminal (`claude`)
4. Référencez le README et les fichiers HTML dans votre premier prompt :

```
Je développe le SaaS Freelance Flow en Next.js 14 (App Router) + Tailwind + Shadcn/ui + Supabase + Prisma.
Les maquettes HTML haute-fidélité et le cahier des charges complet sont dans design_ref/.
Commence par lire design_ref/README.md, puis implémente [la page X].
```

5. Pour chaque page, Claude Code peut lire le HTML de référence avec :
```
Lis design_ref/Factures.html pour voir le rendu attendu, puis crée app/(app)/factures/page.tsx en respectant les tokens du design system.
```
