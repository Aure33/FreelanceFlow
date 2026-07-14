import { DashboardHeader } from "@/components/dashboard/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PriorityPanel } from "@/components/dashboard/priority-panel";
import { RecentInvoices } from "@/components/dashboard/recent-invoices";
import { TopClients } from "@/components/dashboard/top-clients";
import { OnboardingView } from "@/components/onboarding/onboarding-view";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getUsage } from "@/app/(app)/abonnement/actions";
import {
  getDashboardData,
  getOnboardingStatus,
  isOnboardingDismissed,
} from "./actions";

export default async function DashboardPage() {
  // Premier lancement (#60) : un compte sans AUCUN document voit le guide
  // « Premiers pas » à la place du tableau de bord (sauf s'il l'a ignoré —
  // cookie lu en premier, gratuit). Tout part en parallèle pour ne pas ajouter
  // d'aller-retour séquentiel au cas courant (compte actif) — cf. #56 : la
  // latence perçue prime ; les requêtes « gaspillées » d'un compte vide sont
  // des agrégats sur tables vides, quasi gratuites.
  const dismissed = isOnboardingDismissed();
  const [profile, usage, data, onboarding] = await Promise.all([
    getCurrentUserProfile(),
    getUsage(),
    getDashboardData(),
    dismissed.then((d) => (d ? null : getOnboardingStatus())),
  ]);
  const firstName = profile?.name.split(" ")[0] ?? "";

  if (onboarding && onboarding.documentCount === 0) {
    return <OnboardingView firstName={firstName} counts={onboarding} />;
  }

  return (
    <>
      <DashboardHeader
        firstName={firstName}
        dateLabel={data.todayLabel}
        usage={usage}
      />

      <KpiCards kpis={data.kpis} />

      {/* Grille principale : graphe CA (1fr) + panneau prioritaire (380px) */}
      <div className="grid grid-cols-[1fr_380px] items-start gap-gap max-[1100px]:grid-cols-1">
        <RevenueChart data={data.monthlyRevenue} />
        <PriorityPanel priority={data.priority} />
      </div>

      {/* Bandeau bas : factures récentes (2 col) + top clients */}
      <div className="mt-gap grid grid-cols-3 gap-gap max-[1100px]:grid-cols-1">
        <RecentInvoices invoices={data.recentInvoices} />
        <TopClients topClients={data.topClients} />
      </div>
    </>
  );
}
