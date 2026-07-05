import { ReportsHeader } from "@/components/rapports/reports-header";
import { KpiCards } from "@/components/rapports/kpi-cards";
import { RevenueChart } from "@/components/rapports/revenue-chart";
import {
  ClientRevenueCard,
  PaymentDelaysCard,
} from "@/components/rapports/premium-cards";
import { getReportsData } from "./actions";

export default async function RapportsPage() {
  const data = await getReportsData();

  return (
    <>
      <ReportsHeader year={data.year} />

      <KpiCards data={data} />

      <RevenueChart data={data} />

      {/* Statistiques avancées (Premium) — `.adv-grid` */}
      <div className="mt-gap grid grid-cols-2 gap-gap max-[1100px]:grid-cols-1">
        <ClientRevenueCard data={data.premium.clientRevenueBreakdown} />
        <PaymentDelaysCard data={data.premium.paymentDelaysByClient} />
      </div>
    </>
  );
}
