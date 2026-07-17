// Rendu PDF d'un document (facture/devis) — issue #9, extrait en #83 pour être
// réutilisé par la route de téléchargement ET la server action d'envoi par
// e-mail (mêmes octets, une seule source de vérité).
//
// Puppeteer NAVIGUE vers la vraie page interne (/factures/:id ou /devis/:id),
// rendue par les MÊMES composants que l'aperçu à l'écran : pas de HTML
// dupliqué pour le PDF. Ces routes étant protégées par le middleware Supabase
// Auth, l'appelant DOIT forwarder le cookie de session (sinon la navigation
// redirige vers /connexion et le PDF contiendrait la page de login).
//
// SERVEUR UNIQUEMENT (Node — Puppeteer est incompatible avec l'Edge runtime).

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

// 595×842 CSS px = la définition d'« A4 » de ce projet (cf. document-paper.tsx),
// PAS le format A4 standard 210×297mm de Puppeteer — dimensions imposées pour
// reproduire l'aperçu à l'écran à l'identique.
const PDF_WIDTH = "595px";
const PDF_HEIGHT = "842px";

export async function renderDocumentPdf(opts: {
  origin: string;
  internalPath: string; // "/factures/:id" ou "/devis/:id"
  cookieHeader: string; // cookie de session à forwarder (page protégée)
}): Promise<Buffer> {
  let browser: import("puppeteer-core").Browser | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie: opts.cookieHeader });
    await page.setViewport({ width: 595, height: 842 });
    await page.goto(`${opts.origin}${opts.internalPath}`, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}
