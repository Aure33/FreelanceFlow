// URL signée du logo (issue #87) — le bucket `logos` est PRIVÉ : l'affichage
// (carte Paramètres, en-tête A4 des vues document, page publique /proposition,
// PDF Puppeteer qui navigue vers ces pages) passe par une URL signée à durée
// limitée.
//
// La clé service n'est utilisée ici QUE pour SIGNER une URL de lecture d'un
// chemin dont l'appartenance a déjà été établie par la requête appelante
// (logo_path lu sur la ligne `users` du propriétaire du document) — jamais
// pour écrire (les écritures passent par le client de session, RLS réelle,
// cf. logo-actions.ts).

import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SECONDS = 3600;

export async function signedLogoUrl(
  logoPath: string | null,
): Promise<string | null> {
  if (!logoPath) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null; // build/CI sans secrets : fallback sans logo

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await admin.storage
    .from("logos")
    .createSignedUrl(logoPath, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}
