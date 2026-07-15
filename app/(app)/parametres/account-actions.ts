"use server";

// Server actions de la section « Compte » des Paramètres (issue #68) :
// changement de mot de passe, changement d'e-mail, suppression de compte
// (droit à l'effacement RGPD — promis par la politique de confidentialité).
//
// SÉCURITÉ :
//  - toutes les actions repartent de la SESSION (getCurrentUser — token
//    validé serveur), jamais d'un id fourni par le client ;
//  - changement de mot de passe : le mot de passe ACTUEL est re-vérifié via
//    un client Supabase jetable (sans persistance de session — il ne touche
//    pas aux cookies de la vraie session) avant tout updateUser ;
//  - suppression : confirmation forte (saisie exacte de l'e-mail du compte),
//    effacement des données métier dans UNE transaction Prisma (lignes →
//    documents → projets → clients → profil), puis suppression du compte
//    Auth via l'API admin (clé secrète serveur, jamais exposée), puis
//    déconnexion. Aucun message d'erreur ne contient de détail technique.

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export type AccountActionResult = { error?: string; success?: boolean };

// Mêmes règles que lib/auth/actions.ts (inscription/réinitialisation).
const newPasswordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis."),
  newPassword: newPasswordSchema,
});

const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .min(1, "La nouvelle adresse e-mail est requise.")
    .email("Adresse e-mail invalide."),
});

// --- Mot de passe --------------------------------------------------------------

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user?.email) return { error: "Session expirée. Reconnectez-vous." };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  // Re-vérification du mot de passe ACTUEL avec un client jetable : ne
  // persiste rien (pas de cookie touché). Un compte Google (OAuth, sans mot
  // de passe) échoue ici avec le même message — c'est voulu.
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: verifyError } = await bare.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return { error: "Mot de passe actuel incorrect." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    // Supabase refuse notamment un nouveau mot de passe identique à l'ancien.
    if (
      error.code === "same_password" ||
      /different from the old password/i.test(error.message ?? "")
    ) {
      return { error: "Le nouveau mot de passe doit être différent de l'actuel." };
    }
    return {
      error: "Impossible de mettre à jour le mot de passe. Réessayez dans un instant.",
    };
  }

  return { success: true };
}

// --- E-mail ---------------------------------------------------------------------

// Lance le changement d'adresse : Supabase envoie un lien de confirmation aux
// DEUX adresses (« secure email change ») — le changement n'est effectif
// qu'après les confirmations, et le trigger on_auth_user_email_updated
// répercute alors la nouvelle adresse sur public.users.
export async function changeEmail(input: {
  newEmail: string;
}): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user?.email) return { error: "Session expirée. Reconnectez-vous." };

  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  }
  if (parsed.data.newEmail.toLowerCase() === user.email.toLowerCase()) {
    return { error: "C'est déjà l'adresse de votre compte." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    email: parsed.data.newEmail,
  });
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return { error: "Cette adresse est déjà utilisée par un autre compte." };
    }
    if (error.status === 429) {
      return { error: "Trop de tentatives pour le moment. Réessayez dans quelques minutes." };
    }
    return {
      error: "Impossible de changer l'adresse e-mail. Réessayez dans un instant.",
    };
  }

  return { success: true };
}

// --- Suppression de compte (droit à l'effacement, RGPD) ---------------------------

export async function deleteAccount(input: {
  confirmEmail: string;
}): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (!user?.email) return { error: "Session expirée. Reconnectez-vous." };

  // Confirmation forte : l'utilisateur doit retaper l'adresse de SON compte.
  if (
    input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return { error: "L'adresse saisie ne correspond pas à celle du compte." };
  }

  try {
    // Effacement métier dans UNE transaction, enfants → parents. La colonne
    // auto-référencée documents.source_quote_id est en SET NULL : supprimer
    // tous les documents d'un coup est sûr. Le profil public.users part en
    // dernier. (Les FK sont déjà en cascade — la transaction explicite rend
    // l'effacement RGPD indépendant de la config des contraintes.)
    await prisma.$transaction([
      prisma.documentLine.deleteMany({ where: { userId: user.id } }),
      prisma.document.deleteMany({ where: { userId: user.id } }),
      prisma.project.deleteMany({ where: { userId: user.id } }),
      prisma.client.deleteMany({ where: { userId: user.id } }),
      prisma.user.deleteMany({ where: { id: user.id } }),
    ]);

    // Compte Auth (auth.users) via l'API admin — clé secrète SERVEUR.
    const admin = createBareClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch {
    return {
      error:
        "Impossible de supprimer le compte pour le moment. Réessayez dans un instant.",
    };
  }

  // Déconnexion locale (cookies) puis retour à l'accueil public.
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
