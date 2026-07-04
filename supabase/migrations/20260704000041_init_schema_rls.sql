-- ============================================================================
-- FreelanceFlow — Schéma initial + RLS + trigger auth (issue #4)
-- Source de vérité de la base : cette migration SQL versionnée.
-- Montants TOUJOURS en centimes entiers. TVA par ligne.
-- Isolation : user_id = auth.uid() (RLS FOR ALL, USING + WITH CHECK) sur chaque table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table users : profil applicatif. id = auth.users.id (1:1).
-- Alimentée automatiquement par le trigger handle_new_user (voir plus bas).
-- ---------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  name        text,                          -- Nom / raison sociale de l'indépendant
  activity    text,                          -- Activité (Profil.html)
  phone       text,
  address     text,
  siret       text,
  tva_regime  text not null default 'reel'
              check (tva_regime in ('franchise', 'reel', 'normal')),
  plan_type   text not null default 'free'
              check (plan_type in ('free', 'premium')),
  iban        text,                          -- Coordonnées bancaires (optionnel)
  bic         text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  name           text not null,              -- Nom / raison sociale
  siren          text,
  email          text,
  phone          text,
  address        text,
  sector         text,                       -- Secteur d'activité (colonne "Secteur" de Clients.html)
  payment_terms  text,                       -- Conditions de paiement par défaut
  iban           text,                       -- RIB optionnel
  bic            text,
  created_at     timestamptz not null default now()
);
create index clients_user_id_idx on public.clients (user_id);

-- ---------------------------------------------------------------------------
-- Table projects
-- client_id ON DELETE RESTRICT : un client rattaché à des projets ne peut pas
-- être supprimé (garantit transitivement l'interdiction de supprimer un
-- client référencé par des documents — cf. spec "ON DELETE RESTRICT").
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete restrict,
  name        text not null,
  status      text not null default 'en_cours'
              check (status in ('en_cours', 'termine', 'en_pause')),
  progress    integer not null default 0 check (progress between 0 and 100), -- avancement %
  notes       text,
  created_at  timestamptz not null default now()
);
create index projects_user_id_idx on public.projects (user_id);
create index projects_client_id_idx on public.projects (client_id);

-- ---------------------------------------------------------------------------
-- Table documents (devis / factures)
-- project_id ON DELETE RESTRICT : un projet portant des documents ne peut pas
-- être supprimé (on ne perd jamais une facture émise).
-- number : nullable tant que brouillon ; unique par utilisateur une fois émis.
-- ---------------------------------------------------------------------------
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete restrict,
  type            text not null check (type in ('devis', 'facture')),
  number          text,                      -- ex. FAC-2026-001 (généré à l'émission, issue #8)
  status          text not null default 'brouillon'
                  check (status in ('brouillon', 'envoye', 'accepte', 'refuse', 'paye', 'en_retard')),
  object          text,                      -- Objet du document
  tva_regime      text check (tva_regime in ('franchise', 'reel', 'normal')), -- copié du user à l'émission
  total_ht_cents  integer not null default 0,   -- centimes entiers
  total_tva_cents integer not null default 0,   -- centimes entiers
  total_ttc_cents integer not null default 0,   -- centimes entiers
  issued_at       timestamptz,               -- null tant que brouillon
  due_at          timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  -- Unicité de la numérotation par utilisateur (les NULL n'entrent pas en conflit)
  constraint documents_user_number_key unique (user_id, number)
);
create index documents_user_id_idx on public.documents (user_id);
create index documents_project_id_idx on public.documents (project_id);

-- ---------------------------------------------------------------------------
-- Table document_lines (lignes de prestation)
-- quantity et tva_rate en numeric (heures fractionnées, taux 5,5 % etc.).
-- unit_price_cents en centimes entiers. Total de ligne calculé applicativement.
-- document_id ON DELETE CASCADE : les lignes suivent la vie du document.
-- ---------------------------------------------------------------------------
create table public.document_lines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  document_id      uuid not null references public.documents (id) on delete cascade,
  label            text not null,            -- Désignation / description
  quantity         numeric(12, 2) not null default 1,
  unit_price_cents integer not null default 0,  -- centimes entiers
  tva_rate         numeric(5, 2) not null default 20, -- taux TVA par ligne (0 en franchise)
  position         integer not null default 0,   -- ordre d'affichage
  created_at       timestamptz not null default now()
);
create index document_lines_user_id_idx on public.document_lines (user_id);
create index document_lines_document_id_idx on public.document_lines (document_id);

-- ============================================================================
-- Trigger : à chaque inscription (auth.users), créer la ligne public.users.
-- SECURITY DEFINER + search_path vide (bonne pratique Supabase) : le trigger
-- s'exécute avec les droits du propriétaire (postgres) et contourne la RLS
-- pour l'INSERT initial. Noms pleinement qualifiés obligatoires.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security — isolation par utilisateur sur CHAQUE table.
-- FOR ALL (SELECT/INSERT/UPDATE/DELETE), USING + WITH CHECK.
-- Prisma (connexion via le rôle direct) contourne la RLS ; celle-ci est la
-- défense en profondeur pour tout accès via le client Supabase (JWT).
-- ============================================================================
alter table public.users          enable row level security;
alter table public.clients        enable row level security;
alter table public.projects       enable row level security;
alter table public.documents      enable row level security;
alter table public.document_lines enable row level security;

-- users : la clé d'isolation est l'id lui-même (= auth.uid()).
create policy users_isolation on public.users
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy clients_isolation on public.clients
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy projects_isolation on public.projects
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy documents_isolation on public.documents
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy document_lines_isolation on public.document_lines
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- GRANTs : le rôle `authenticated` (JWT Supabase) n'a de droits que via la RLS
-- ci-dessus. Sans ces GRANTs, l'accès Data API serait refusé en amont de la
-- RLS ; avec eux, la RLS devient l'unique barrière effective (modèle voulu).
-- Le rôle `anon` n'obtient aucun droit sur ces tables.
-- ============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.users, public.clients, public.projects, public.documents, public.document_lines
  to authenticated;
