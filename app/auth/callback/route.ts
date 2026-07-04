import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Callback OAuth (Google via Supabase). Le navigateur revient ici après
// consentement avec un `code` ; on l'échange contre une session (flux PKCE,
// vérificateur stocké en cookie par le client navigateur), puis on redirige.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Pas de code ou échange en erreur → retour connexion avec indicateur.
  return NextResponse.redirect(`${origin}/connexion?error=oauth`);
}
