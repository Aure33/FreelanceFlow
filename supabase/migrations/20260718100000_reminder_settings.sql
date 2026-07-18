-- ============================================================================
-- FreelanceFlow — relances automatiques des factures en retard (#84)
--
-- users.* : réglages de relance persistés depuis la carte « Relances
--   automatiques » des Paramètres (#12, jusqu'ici décorative). Les valeurs
--   possibles sont whitelistées côté application (zod) : first ∈ {3,7,10},
--   second ∈ {10,15,21}, final ∈ {21,30,45}, tone ∈ {courtois,neutre,ferme}.
--   Un compte FREE peut sauvegarder sa configuration (elle « s'activera dès
--   votre passage en Premium », copie existante de la carte) mais le cron ne
--   traite QUE les comptes premium avec reminders_enabled = true.
--
-- documents.* : traçabilité des relances envoyées par le cron —
--   reminder_count = nombre de relances déjà parties (0..3, une par palier
--   J+first / J+second / J+final), last_reminder_at = horodatage SERVEUR du
--   dernier envoi (idempotence : jamais deux relances le même jour UTC).
-- ============================================================================
alter table public.users
  add column reminders_enabled boolean not null default false,
  add column reminder_first_days integer not null default 7,
  add column reminder_second_days integer not null default 15,
  add column reminder_final_days integer not null default 30,
  add column reminder_tone text not null default 'courtois';

alter table public.documents
  add column reminder_count integer not null default 0,
  add column last_reminder_at timestamptz;
