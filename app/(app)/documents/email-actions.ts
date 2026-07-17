"use server";

// Envoi d'un devis/facture par e-mail au client (issue #83) — le statut
// « envoyé » d'un document était jusqu'ici purement déclaratif (#7/#8) :
// aucun e-mail n'était réellement transmis. Cette action génère le PDF (même
// pipeline que le téléchargement, #9) et l'envoie en pièce jointe via Resend.
//
// SÉCURITÉ : requireUserId() (jamais getCurrentUser — cf. #68, une server
// action doit rester mockable en intégration sans fuite entre fichiers de
// test) ; appartenance vérifiée par getDocument() (where: { id, userId }) ;
// un brouillon (sans numéro légal) est refusé, comme le téléchargement PDF.
//
// ⚠️ RESEND PALIER GRATUIT SANS DOMAINE VÉRIFIÉ : l'expéditeur est forcément
// onboarding@resend.dev et Resend REFUSE tout destinataire autre que
// l'adresse du compte Resend lui-même (anti-abus). L'erreur est détectée et
// traduite en français plutôt que remontée telle quelle.

import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { z } from "zod";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";
import { renderDocumentPdf } from "@/lib/pdf";
import { getDocument } from "./actions";

export type SendEmailResult = { ok: true; sentAt: Date } | { error: string };

const sendEmailSchema = z.object({
  to: z.string().trim().email("Adresse e-mail invalide."),
});

// Point d'entrée appelé par l'UI : résout origin/cookie depuis la requête
// entrante (next/headers) puis délègue à la logique métier ci-dessous.
export async function sendDocumentByEmail(
  id: string,
  input: { to: string },
): Promise<SendEmailResult> {
  // Origin + cookie de session — mêmes conventions que lib/auth/actions.ts
  // (reset de mot de passe) et la route PDF (#9), adaptées au contexte d'une
  // server action (pas de NextRequest disponible ici).
  const h = await headers();
  const origin =
    h.get("origin") ??
    (h.get("host")
      ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? ""));
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return sendDocumentByEmailCore(id, input, { origin, cookieHeader });
}

// Logique métier isolée de next/headers (mocké globalement et de façon
// incompatible par d'autres fichiers de test, cf. #68) : appelée directement
// par les tests d'intégration avec un contexte origin/cookie factice.
export async function sendDocumentByEmailCore(
  id: string,
  input: { to: string },
  reqCtx: { origin: string; cookieHeader: string },
): Promise<SendEmailResult> {
  const userId = await requireUserId();

  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Document introuvable." };
  }
  const parsed = sendEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  }

  // getDocument() applique déjà tout le filtrage sécurité (where userId).
  const doc = await getDocument(id);
  if (!doc) return { error: "Document introuvable." };
  if (doc.status === "brouillon" || !doc.number) {
    return { error: "Émettez le document avant de l'envoyer par e-mail." };
  }

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const { origin, cookieHeader } = reqCtx;
  const internalPath =
    doc.type === "facture" ? `/factures/${doc.id}` : `/devis/${doc.id}`;

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderDocumentPdf({ origin, internalPath, cookieHeader });
  } catch {
    return {
      error: "Impossible de générer le PDF. Réessayez dans un instant.",
    };
  }

  const kind = doc.type === "facture" ? "Facture" : "Devis";
  const emitterName = profile?.name ?? "Freelance Flow";
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: "Freelance Flow <onboarding@resend.dev>",
    to: parsed.data.to,
    replyTo: profile?.email ?? undefined,
    subject: `${kind} ${doc.number} — ${emitterName}`,
    html: `
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint ${kind === "Facture" ? "la facture" : "le devis"}
      <strong>${doc.number}</strong>${doc.object ? ` — ${doc.object}` : ""}.</p>
      <p>Cordialement,<br>${emitterName}</p>
    `.trim(),
    attachments: [{ filename: `${doc.number}.pdf`, content: pdfBuffer }],
  });

  if (error) {
    // Restriction anti-abus du palier gratuit Resend (aucun domaine vérifié) :
    // seule l'adresse du compte Resend peut recevoir un envoi. Traduit pour
    // que la démo reste compréhensible plutôt qu'un message technique anglais.
    if (/own email address|verify a domain/i.test(error.message)) {
      return {
        error:
          "Mode démo : sans domaine vérifié, Resend n'autorise l'envoi qu'à l'adresse e-mail du compte Resend du freelance.",
      };
    }
    return {
      error: "Impossible d'envoyer l'e-mail. Réessayez dans un instant.",
    };
  }

  const sentAt = new Date();
  await prisma.document.updateMany({
    where: { id, userId },
    data: { emailSentAt: sentAt },
  });
  revalidatePath(`/${doc.type === "facture" ? "factures" : "devis"}/${id}`);

  return { ok: true, sentAt };
}
