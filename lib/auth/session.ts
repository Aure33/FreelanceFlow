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

// Profil d'affichage pour l'UI (sidebar, etc.). Le nom vient des métadonnées
// Auth : `full_name`/`name` (comptes Google) ou `first_name`+`last_name`
// (inscription e-mail), avec repli sur le préfixe de l'e-mail.
export type UserProfile = { name: string; email: string; initials: string };

function computeInitials(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "U").toUpperCase();
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const email = user.email ?? "";
  const name =
    meta.full_name?.trim() ||
    meta.name?.trim() ||
    [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim() ||
    email.split("@")[0] ||
    "Utilisateur";
  return { name, email, initials: computeInitials(name || email) };
}
