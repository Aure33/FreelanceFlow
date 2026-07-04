// Helpers de session côté SERVEUR uniquement.
// Toutes les fonctions s'appuient sur supabase.auth.getUser() qui VALIDE le
// token auprès du serveur Auth de Supabase (contrairement à getSession() qui
// se contente de lire le cookie). C'est cet userId qui doit alimenter chaque
// requête Prisma : where: { userId }.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

// Retourne l'utilisateur authentifié (token vérifié) ou null.
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// À utiliser dans les server actions / server components avant toute requête
// Prisma. Redirige vers /connexion si aucun utilisateur authentifié.
// Renvoie l'UUID à passer en where: { userId }.
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/connexion");
  }
  return user.id;
}
