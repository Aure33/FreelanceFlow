// Rafraîchissement de session pour le middleware (pattern officiel @supabase/ssr).
// À chaque requête : on relit les cookies, on rafraîchit le token si besoin, et
// on applique les règles d'accès (routes protégées vs pages d'auth publiques).
//
// IMPORTANT : ne rien exécuter entre createServerClient et getUser() — un appel
// intermédiaire pourrait invalider la session et provoquer des déconnexions
// aléatoires.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Préfixes du groupe applicatif (app) : accès réservé aux utilisateurs connectés.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/clients",
  "/projets",
  "/devis",
  "/factures",
  "/documents",
  "/rapports",
  "/abonnement",
  "/parametres",
];

// Pages d'authentification : un utilisateur déjà connecté n'a rien à y faire.
const AUTH_ROUTES = ["/connexion", "/inscription"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // NE PAS supprimer : rafraîchit la session et alimente request/response cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Non connecté sur une route protégée → redirige vers /connexion.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    return NextResponse.redirect(url);
  }

  // Déjà connecté sur /connexion ou /inscription → redirige vers /dashboard.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
