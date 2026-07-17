import { SubscriptionView } from "@/components/abonnement/subscription-view";
import { getUsage } from "./actions";

// Page Abonnement (issue #10, AC #4 ; paiement réel #82) : données réelles
// (getUsage(), filtrées userId côté server action) passées au composant
// client qui gère le toggle mensuel/annuel et ouvre une vraie session Stripe
// Checkout (mode test) — le Premium n'est accordé que par le webhook.
export default async function AbonnementPage() {
  const usage = await getUsage();

  return <SubscriptionView usage={usage} />;
}
