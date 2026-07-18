"use server";

// Logo d'entreprise (issue #87) — upload/remplacement/suppression dans le
// bucket Supabase Storage PRIVÉ `logos`.
//
// SÉCURITÉ : les écritures storage passent par le client Supabase de SESSION
// (lib/supabase/server, clé publishable + cookies) — la RLS du bucket
// (`(storage.foldername(name))[1] = auth.uid()`) est donc la VRAIE barrière,
// pas seulement le chemin construit ici. Jamais la clé service pour écrire.
// La validation (type/taille) est doublée : zod-like côté action + limites du
// bucket (2 Mo, MIME whitelistés) appliquées par Supabase lui-même.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type LogoActionResult = { ok: true } | { error: string };

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo — même limite que le bucket
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
};

// Revalide les vues qui affichent l'émetteur (le logo apparaît sur l'A4).
function revalidateEmitterViews() {
  revalidatePath("/parametres");
  revalidatePath("/factures");
  revalidatePath("/devis");
}

export async function uploadLogo(formData: FormData): Promise<LogoActionResult> {
  const userId = await requireUserId();

  // Fonctionnalité vendue Premium (« Logo personnalisé sur les documents »,
  // page /abonnement) — garde SERVEUR, pas seulement l'UI. La suppression,
  // elle, reste ouverte à tous (un compte redescendu en free doit pouvoir
  // retirer son logo).
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { planType: true },
  });
  if (me?.planType !== "premium") {
    return { error: "Fonctionnalité réservée au forfait Premium." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionnez un fichier image." };
  }
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return { error: "Format accepté : PNG, SVG ou JPEG." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Le fichier dépasse 2 Mo." };
  }

  const path = `${userId}/logo.${ext}`;
  const supabase = await createClient();

  // Remplacement : si l'extension change (ex. png -> svg), l'ancien objet ne
  // sera pas écrasé par l'upsert — on le supprime d'abord.
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { logoPath: true },
  });
  if (previous?.logoPath && previous.logoPath !== path) {
    await supabase.storage.from("logos").remove([previous.logoPath]);
  }

  const { error } = await supabase.storage
    .from("logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) {
    return { error: "Impossible d'enregistrer le logo. Réessayez dans un instant." };
  }

  await prisma.user.update({ where: { id: userId }, data: { logoPath: path } });
  revalidateEmitterViews();
  return { ok: true };
}

export async function deleteLogo(): Promise<LogoActionResult> {
  const userId = await requireUserId();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { logoPath: true },
  });
  if (!me?.logoPath) return { ok: true }; // déjà sans logo — idempotent

  const supabase = await createClient();
  const { error } = await supabase.storage.from("logos").remove([me.logoPath]);
  if (error) {
    return { error: "Impossible de supprimer le logo. Réessayez dans un instant." };
  }

  await prisma.user.update({ where: { id: userId }, data: { logoPath: null } });
  revalidateEmitterViews();
  return { ok: true };
}
