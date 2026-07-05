import { DashboardHeader } from "@/components/dashboard/page-header";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PriorityPanel } from "@/components/dashboard/priority-panel";
import { RecentInvoices } from "@/components/dashboard/recent-invoices";
import { TopClients } from "@/components/dashboard/top-clients";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getUsage } from "@/app/(app)/abonnement/actions";

export default async function DashboardPage() {
  const [profile, usage] = await Promise.all([
    getCurrentUserProfile(),
    getUsage(),
  ]);
  const firstName = profile?.name.split(" ")[0] ?? "";

  return (
    <>
      <DashboardHeader firstName={firstName} usage={usage} />

      <KpiCards />

      {/* Grille principale : graphe CA (1fr) + panneau prioritaire (380px) */}
      <div className="grid grid-cols-[1fr_380px] items-start gap-gap max-[1100px]:grid-cols-1">
        <RevenueChart />
        <PriorityPanel />
      </div>

      {/* Bandeau bas : factures récentes (2 col) + top clients */}
      <div className="mt-gap grid grid-cols-3 gap-gap max-[1100px]:grid-cols-1">
        <RecentInvoices />
        <TopClients />
      </div>
    </>
  );
}
