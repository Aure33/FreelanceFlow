-- ============================================================================
-- FreelanceFlow — synchronisation de l'e-mail auth.users → public.users (#68)
-- Le changement d'e-mail (Paramètres → Compte) passe par la double
-- confirmation Supabase : l'e-mail d'auth.users ne change qu'après le clic
-- sur les liens de confirmation — bien APRÈS la fin de la server action.
-- Ce trigger répercute le changement sur public.users.email (colonne
-- d'affichage/unicité du profil), quel que soit le moment où il survient.
-- Même conventions que handle_new_user : SECURITY DEFINER + search_path vide,
-- noms pleinement qualifiés.
-- ============================================================================
create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_updated();
