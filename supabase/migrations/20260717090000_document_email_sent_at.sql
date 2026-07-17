-- ============================================================================
-- FreelanceFlow — documents.email_sent_at : envoi par e-mail au client (#83)
-- Horodatage SERVEUR (posé uniquement par la server action sendDocumentByEmail,
-- jamais éditable par l'utilisateur) du dernier envoi réussi du PDF par e-mail.
-- Nullable : aucun envoi par défaut. Distinct du statut métier `status` (qui
-- reste piloté manuellement par l'utilisateur, cf. #7/#8) — un document peut
-- être marqué « envoyé » dans l'app sans qu'aucun e-mail n'ait jamais été émis,
-- et inversement un e-mail peut être renvoyé sans changer le statut.
-- ============================================================================
alter table public.documents
  add column email_sent_at timestamptz;
