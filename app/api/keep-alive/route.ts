import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Endpoint de maintien en activité (keep-alive) — maintenance opérationnelle.
// Le palier gratuit de Supabase met le projet en pause après ~7 jours sans
// activité ; une requête triviale suffit à réarmer ce compteur. Appelé
// périodiquement par une tâche planifiée (cron Supabase, cf. documentation
// d'exploitation). N'expose AUCUNE donnée applicative : un simple `SELECT 1`
// contre la base, puis un horodatage. Sert aussi de contrôle de santé
// (200 = base joignable, 503 = base injoignable).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
