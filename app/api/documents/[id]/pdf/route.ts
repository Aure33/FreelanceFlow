import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDocument } from "@/app/(app)/documents/actions";
import { renderDocumentPdf } from "@/lib/pdf";

// Génération PDF côté SERVEUR uniquement (spec sécurité RNCP) — jamais côté
// client. Runtime Node (Puppeteer a besoin de Node, incompatible avec Edge).
export const runtime = "nodejs";

// Le rendu Puppeteer (navigation + cookie forwardé + dimensions 595×842) est
// mutualisé avec l'envoi par e-mail (#83) dans lib/pdf.ts.

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // 1) Session : un vrai 401 JSON (pas de redirect(), inadapté à un téléchargement).
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // 2) Validation + appartenance : getDocument() fait déjà tout le filtrage
  // sécurité (where: { id, userId }) — on ne réinvente rien ici.
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json(
      { error: "Document introuvable." },
      { status: 404 },
    );
  }

  const doc = await getDocument(params.id);
  if (!doc) {
    return NextResponse.json(
      { error: "Document introuvable." },
      { status: 404 },
    );
  }

  // 3) Un brouillon n'a pas de numéro légal : mentions/numérotation non figées.
  if (doc.status === "brouillon" || !doc.number) {
    return NextResponse.json(
      { error: "Émettez le document avant de télécharger le PDF." },
      { status: 400 },
    );
  }

  const internalPath =
    doc.type === "facture" ? `/factures/${doc.id}` : `/devis/${doc.id}`;
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get("cookie") ?? "";

  try {
    const pdfBuffer = await renderDocumentPdf({
      origin,
      internalPath,
      cookieHeader,
    });

    // TypeScript n'accepte pas directement Buffer<ArrayBufferLike> comme
    // BodyInit du constructeur Response — Uint8Array (même octets) si.
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${doc.number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Jamais de stack trace exposée au client.
    return NextResponse.json(
      { error: "Impossible de générer le PDF. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}
