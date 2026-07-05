"use server";

// Server actions du paywall freemium (issue #10).
//
// SÉCURITÉ (non négociable) : chaque fonction passe par requireUserId() et
// filtre where: { userId }. Le calcul du quota est fait ICI, côté serveur —
// jamais confié au client (la garde réelle est dans emitDocument(), pas dans
// l'UI). Sélections Prisma explicites (éco-conception).
//
// Le compteur mensuel s'appuie sur `documents.emitted_at`, un horodatage
// SERVEUR posé une seule fois par emitDocument() (voir app/(app)/documents/
// actions.ts) — jamais sur `issued_at`, éditable par l'utilisateur dans
// l'éditeur, qui serait contournable en antidatant/postdatant.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/session";

// Forme exposée à l'UI (jauge sidebar, bannière Devis/Factures, modale
// paywall, page /abonnement, garde-fou /documents/nouveau).
// documentsLimit : 5 pour "free", null pour "premium" (illimité — pas de
// magic number côté consommateur, un null est explicite à tester).
export type Usage = {
  planType: "free" | "premium";
  documentsThisMonth: number;
  documentsLimit: number | null;
  clientsCount: number;
  memberSince: Date;
};

function normalizePlan(value: string | undefined): "free" | "premium" {
  return value === "premium" ? "premium" : "free";
}

// Bornes du mois calendaire courant, en UTC (même convention que la
// numérotation FAC-/DEV- dans documents/actions.ts : year = getUTCFullYear()).
function currentMonthRangeUtc(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

// Usage courant de l'utilisateur : plan, documents émis ce mois-ci (devis +
// factures confondus, comptés via emittedAt), nombre de clients (informatif,
// illimité quel que soit le plan), ancienneté du compte.
export async function getUsage(): Promise<Usage> {
  const userId = await requireUserId();
  const { start, end } = currentMonthRangeUtc();

  const [me, documentsThisMonth, clientsCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, createdAt: true },
    }),
    prisma.document.count({
      where: { userId, emittedAt: { gte: start, lt: end } },
    }),
    prisma.client.count({ where: { userId } }),
  ]);

  const planType = normalizePlan(me?.planType);

  return {
    planType,
    documentsThisMonth,
    documentsLimit: planType === "premium" ? null : 5,
    clientsCount,
    memberSince: me?.createdAt ?? new Date(),
  };
}

// Upgrade SIMULÉ vers le forfait Premium (décision validée : aucune
// intégration de paiement réelle dans ce projet RNCP — immédiat, sans
// Stripe). Revalide les pages affichant la jauge freemium.
export async function upgradeToPremium(): Promise<{ ok: true }> {
  const userId = await requireUserId();

  await prisma.user.update({
    where: { id: userId },
    data: { planType: "premium" },
  });

  revalidatePath("/abonnement");
  revalidatePath("/dashboard");
  revalidatePath("/factures");
  revalidatePath("/devis");

  return { ok: true };
}
