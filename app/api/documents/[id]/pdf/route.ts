import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { getCurrentUser } from "@/lib/auth/session";
import { getDocument } from "@/app/(app)/documents/actions";

// Génération PDF côté SERVEUR uniquement (spec sécurité RNCP) — jamais côté
// client. Runtime Node (Puppeteer a besoin de Node, incompatible avec Edge).
export const runtime = "nodejs";

// Puppeteer NAVIGUE vers la vraie page interne (/factures/:id ou /devis/:id),
// rendue par les MÊMES composants que l'aperçu à l'écran (document-paper.tsx) :
// une seule source de vérité visuelle, pas de HTML dupliqué pour le PDF. Ces
// routes étant protégées par le middleware Supabase Auth, on forward le cookie
// de la requête entrante avant page.goto, sinon la navigation redirige vers
// /connexion et le PDF contiendrait la page de login.

// 595×842 CSS px = la définition d'« A4 » de ce projet (cf. document-paper.tsx),
// PAS le format A4 standard 210×297mm de Puppeteer — on impose ces dimensions
// exactes pour reproduire l'aperçu à l'identique.
const PDF_WIDTH = "595px";
const PDF_HEIGHT = "842px";

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
  const cookie = request.headers.get("cookie") ?? "";

  let browser: import("puppeteer-core").Browser | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie });
    await page.setViewport({ width: 595, height: 842 });
    await page.goto(`${origin}${internalPath}`, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
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
  } finally {
    if (browser) await browser.close();
  }
}
