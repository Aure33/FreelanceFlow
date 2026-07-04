"use server";

// Server actions d'authentification (Supabase Auth).
// Toutes les entrées sont validées avec zod : aucune confiance au client.
// Les messages d'erreur renvoyés sont en français et NE contiennent jamais de
// détail technique (stack, SQL, message Supabase brut).
//
// Confirmation e-mail DÉSACTIVÉE côté projet : signUp renvoie une session
// directement → on redirige vers /dashboard.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Résultat standard d'une action de formulaire (échec).
export type ActionState = { error: string };
// Résultat des actions qui affichent un état de succès dans la page.
export type ActionResult = { error?: string; success?: boolean };

// --- Schémas de validation ---------------------------------------------------

const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

const emailSchema = z
  .string()
  .trim()
  .min(1, "L'adresse e-mail est requise.")
  .email("Adresse e-mail invalide.");

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est requis."),
});

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis."),
  lastName: z.string().trim().min(1, "Le nom est requis."),
  email: emailSchema,
  password: passwordSchema,
});

const resetRequestSchema = z.object({ email: emailSchema });

const updatePasswordSchema = z.object({ password: passwordSchema });

// Message générique : ne révèle jamais la cause exacte (compte inexistant,
// mauvais mot de passe...) pour ne pas faciliter l'énumération de comptes.
const GENERIC_AUTH_ERROR =
  "Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.";

// Traduit une erreur Supabase d'inscription en message utilisateur exact.
function signUpErrorMessage(error: {
  code?: string;
  status?: number;
  message?: string;
}): string {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "Trop de tentatives pour le moment. Réessayez dans quelques minutes.";
  }
  if (
    error.code === "user_already_exists" ||
    /already registered|already been registered/i.test(error.message ?? "")
  ) {
    return "Cette adresse est déjà utilisée.";
  }
  return "Impossible de créer le compte. Réessayez dans un instant.";
}

// --- Connexion ---------------------------------------------------------------

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<ActionState> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: GENERIC_AUTH_ERROR };
  }

  redirect("/dashboard");
}

// --- Inscription -------------------------------------------------------------

export async function signUp(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { firstName, lastName, email, password } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
    },
  });

  if (error) {
    return { error: signUpErrorMessage(error) };
  }

  // Anti-énumération : quand la confirmation e-mail est ACTIVE, Supabase répond
  // à un e-mail déjà pris par un `user` sans identités et sans erreur. On le
  // détecte pour un message clair (sinon l'utilisateur croit s'être inscrit).
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { error: "Cette adresse est déjà utilisée." };
  }

  // Pas de session (confirmation e-mail active) : compte créé, à confirmer.
  if (!data.session) {
    redirect("/connexion?inscription=ok");
  }

  // Session posée : on complète le profil (public.users.name) au nom de
  // l'utilisateur. La RLS autorise l'UPDATE de sa propre ligne (id = auth.uid()).
  // Le trigger on_auth_user_created a déjà créé la ligne (id + email).
  const fullName = `${firstName} ${lastName}`;
  await supabase
    .from("users")
    .update({ name: fullName })
    .eq("id", data.user!.id);

  redirect("/dashboard");
}

// --- Déconnexion -------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}

// --- Demande de réinitialisation de mot de passe -----------------------------

export async function requestPasswordReset(input: {
  email: string;
}): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  }

  // Origin dynamique (dev / preview / prod) pour le lien de retour de l'e-mail.
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host")
      ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? ""));

  const supabase = await createClient();
  // On IGNORE volontairement l'erreur : la réponse est toujours générique pour
  // ne pas révéler si un compte existe pour cette adresse.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/reinitialisation`,
  });

  return { success: true };
}

// --- Mise à jour du mot de passe (après clic sur le lien de reset) -----------

export async function updatePassword(input: {
  password: string;
}): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  }

  const supabase = await createClient();
  // L'utilisateur arrive via le lien de reset : Supabase a déjà posé une
  // session temporaire (échange du code dans le callback / cookie).
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        "Impossible de mettre à jour le mot de passe. Le lien a peut-être expiré, refaites une demande.",
    };
  }

  return { success: true };
}
