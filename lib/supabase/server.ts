// Client Supabase pour le CODE SERVEUR (server actions, server components,
// route handlers). Lit/écrit les cookies de session via next/headers.
// Utilise la clé publishable (anon) : la session utilisateur est portée par
// les cookies, la RLS s'applique donc au nom de l'utilisateur connecté.
// NE JAMAIS importer SUPABASE_SECRET_KEY ici.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : l'écriture des cookies est
            // interdite. Sans conséquence si le middleware rafraîchit la session.
          }
        },
      },
    },
  );
}
