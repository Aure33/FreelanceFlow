// Client Supabase pour les COMPOSANTS CLIENT (navigateur).
// Utilise la clé publishable (anon) : conçue pour être exposée au navigateur,
// la sécurité repose sur la RLS Postgres (user_id = auth.uid()).
// NE JAMAIS importer SUPABASE_SECRET_KEY ici.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
