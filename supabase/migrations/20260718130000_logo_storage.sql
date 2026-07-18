-- ============================================================================
-- FreelanceFlow — logo d'entreprise sur les documents (#87)
--
-- users.logo_path : chemin de l'objet dans le bucket `logos`
--   (`<userId>/logo.<ext>`), null si aucun logo. L'affichage passe par des
--   URLs SIGNÉES à durée limitée (le bucket est PRIVÉ), générées côté serveur.
--
-- Bucket `logos` : PRIVÉ (public = false), 2 Mo max, types d'image
--   whitelistés — les limites sont appliquées PAR SUPABASE au niveau du
--   bucket, en plus de la validation zod côté server action.
--
-- RLS storage.objects : un utilisateur authentifié ne lit/écrit/supprime QUE
--   les objets de SON dossier (premier segment du chemin = auth.uid()). Les
--   écritures passent par le client Supabase de SESSION (jamais la clé
--   service) → ces policies sont la vraie barrière, vérifiée par tests.
-- ============================================================================
alter table public.users
  add column logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  false,
  2097152, -- 2 Mo
  array['image/png', 'image/svg+xml', 'image/jpeg']
);

create policy "logos_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
