// Application du forfait Premium (issue #82) — logique PURE, PAS un fichier
// "use server" : contrairement à une server action, une fonction exportée
// d'ici n'est PAS un endpoint RPC appelable depuis le navigateur. C'est
// volontaire et nécessaire : cette fonction accorde le Premium SANS
// vérification de session — elle ne doit être invocable que par le webhook
// Stripe (authentifié par signature, cf. app/api/stripe/webhook/route.ts),
// jamais directement par un utilisateur.
//
// ⚠️ Avant #82, `upgradeToPremium()` était une server action (donc un endpoint
// RPC public) qui accordait le Premium sans aucune vérification de paiement —
// acceptable tant qu'aucun paiement réel n'existait (#10). Ce n'est plus vrai
// : elle a été SUPPRIMÉE (pas dépréciée) pour ne pas laisser un moyen de
// contourner Stripe. Voir tests/integration/paywall-quota.integration.ts qui
// flippe le plan par écriture Prisma directe (pas via une action) pour tester
// la logique de quota indépendamment du paiement.

import { prisma } from "@/lib/prisma";

export async function applyPremiumPlan(
  userId: string,
  stripe: { customerId: string; subscriptionId: string },
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      planType: "premium",
      stripeCustomerId: stripe.customerId,
      stripeSubscriptionId: stripe.subscriptionId,
    },
  });
}

// Retour au forfait Gratuit — abonnement résilié ou paiement en échec côté
// Stripe. `stripeCustomerId` est CONSERVÉ (même client Stripe réutilisé pour
// un futur abonnement) ; seul `stripeSubscriptionId` est effacé.
export async function revokePremiumPlan(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { planType: "free", stripeSubscriptionId: null },
  });
}
