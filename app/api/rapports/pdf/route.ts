import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { getCurrentUser } from "@/lib/auth/session";
import { parseReportsPeriod } from "@/lib/periods";

// Export PDF de la page Rapports (issue #64) — même architecture que le PDF
// document (#9) : génération côté SERVEUR uniquement, Puppeteer NAVIGUE vers
// la vraie page interne /rapports rendue par les MÊMES composants que l'écran
// (une seule source de vérité visuelle, pas de HTML dupliqué).
//
// SÉCURITÉ / PREMIUM : le cookie de session est forwardé — la page est donc
// rendue POUR CET UTILISATEUR par le serveur : un compte free reçoit `null`
// pour les blocs Premium (getReportsData ne les calcule ni ne les envoie,
// décision #11) → le PDF ne peut pas contenir plus que l'écran.
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Session : un vrai 401 JSON (pas de redirect(), inadapté à un téléchargement).
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const cookie = request.headers.get("cookie") ?? "";
  // Le PDF emporte la période sélectionnée (#65) — whitelist stricte, jamais
  // de paramètre arbitraire réinjecté dans la navigation.
  const period = parseReportsPeriod(
    url.searchParams.get("periode") ?? undefined,
  );
  const reportPath =
    period === "annee" ? "/rapports" : `/rapports?periode=${period}`;

  let browser: import("puppeteer-core").Browser | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(`${origin}${reportPath}`, { waitUntil: "networkidle0" });

    // Contrairement au document (A4 figé 595×842, une page), le rapport est un
    // flux : format A4 standard multi-pages, marges modestes, fonds imprimés
    // (barres du graphe, pastilles). La CSS `print:` du shell masque
    // sidebar/topbar/outils ; `break-inside-avoid` garde chaque carte entière.
    const pdfBuffer = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "24px", bottom: "24px", left: "20px", right: "20px" },
    });

    const year = new Date().getFullYear();
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-activite-${year}.pdf"`,
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
