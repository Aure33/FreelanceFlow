-- ============================================================================
-- FreelanceFlow — Renommage clients.siren -> clients.siret (issue #5)
-- On collecte le SIRET (14 chiffres, établissement) et non le SIREN (9, entité).
-- La table clients est vide en dev : renommage sûr, aucune donnée impactée.
-- ============================================================================
alter table public.clients rename column siren to siret;
