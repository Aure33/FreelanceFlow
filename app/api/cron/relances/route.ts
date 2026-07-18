import { NextRequest, NextResponse } from "next/server";
import { runReminderSweep } from "@/lib/reminder-sweep";

// Cron des relances automatiques (issue #84) — déclenché une fois par jour
// par Vercel Cron (vercel.json). AUCUNE session ici : Vercel appelle ce
// endpoint serveur-à-serveur avec `Authorization: Bearer ${CRON_SECRET}`
// (comportement natif dès que la variable d'environnement existe). Sans le
// secret exact → 401, comme le webhook Stripe (#82) repose sur sa signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const summary = await runReminderSweep();
  return NextResponse.json(summary);
}
