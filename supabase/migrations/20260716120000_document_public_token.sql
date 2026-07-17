-- ============================================================================
-- FreelanceFlow — documents.public_token : lien public de devis (#85)
-- Un devis peut être partagé par une URL tokenisée (/proposition/<token>) où le
-- client l'accepte ou le refuse SANS compte. Le jeton est aléatoire (généré
-- côté serveur), nullable (aucun partage par défaut) et révocable (retour à
-- null). UNIQUE : un jeton identifie un seul devis (les NULL ne comptent pas).
--
-- La RLS existante (user_id = auth.uid()) couvre la colonne comme le reste de la
-- ligne pour les accès AUTHENTIFIÉS. Les accès PUBLICS passent par des server
-- actions qui filtrent explicitement `where { public_token }` + `type='devis'`
-- via Prisma (qui contourne la RLS) — le jeton EST le secret d'accès.
-- ============================================================================
alter table public.documents
  add column public_token text;

create unique index documents_public_token_key
  on public.documents(public_token);
