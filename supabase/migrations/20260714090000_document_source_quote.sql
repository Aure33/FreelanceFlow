-- ============================================================================
-- FreelanceFlow — documents.source_quote_id : traçabilité devis → facture (#61)
-- Une facture créée par « Convertir en facture » référence le devis accepté
-- dont elle est issue. Auto-référence nullable :
--   - null pour tout document qui n'est pas issu d'une conversion ;
--   - on delete set null : supprimer le devis (brouillon) ne casse jamais la
--     facture — la trace disparaît, la pièce comptable reste.
-- La RLS existante (user_id = auth.uid()) couvre la colonne comme le reste de
-- la ligne ; l'applicatif vérifie EN PLUS que le devis source appartient au
-- même utilisateur avant l'insertion (Prisma bypasse la RLS).
-- ============================================================================
alter table public.documents
  add column source_quote_id uuid references public.documents(id) on delete set null;

-- UNIQUE (les NULL ne comptent pas) : un devis ne peut être converti qu'en UNE
-- facture — la contrainte ferme la course « deux conversions simultanées »
-- que le pré-check applicatif seul ne peut pas exclure. Sert aussi d'index FK.
create unique index documents_source_quote_id_key
  on public.documents(source_quote_id);
