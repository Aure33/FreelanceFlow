-- ============================================================================
-- FreelanceFlow — documents.emitted_at : horodatage serveur du paywall (issue #10)
-- `issued_at` reste la date d'émission "métier", éditable par l'utilisateur
-- dans l'éditeur (peut être antidatée pour un besoin réel de facturation).
-- `emitted_at` est un horodatage SERVEUR posé une seule fois, au moment réel
-- de l'appel à emitDocument() — jamais modifiable ensuite, jamais recalculé.
-- C'est la SEULE colonne fiable pour compter le quota mensuel du forfait
-- Gratuit (5 documents émis / mois calendaire) : l'utiliser empêche de
-- contourner la limite en trafiquant la date d'émission affichée.
-- Nullable : les documents déjà émis avant cette migration n'ont pas de valeur
-- rétroactive fiable (on ne réécrit pas l'historique) ; ils ne comptent donc
-- pas dans le quota, ce qui est sans risque (repartir à 0 est plus permissif,
-- jamais moins).
-- ============================================================================
alter table public.documents
  add column emitted_at timestamptz;
