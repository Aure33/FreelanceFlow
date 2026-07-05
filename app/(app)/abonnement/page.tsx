import { SubscriptionView } from "@/components/abonnement/subscription-view";
import { getUsage } from "./actions";

// Page Abonnement (issue #10, AC #4) : données réelles (getUsage(), filtrées
// userId côté server action) passées au composant client qui gère le toggle
// mensuel/annuel et l'upgrade simulé (nécessite useTransition + router.refresh()).
export default async function AbonnementPage() {
  const usage = await getUsage();

  return <SubscriptionView usage={usage} />;
}
