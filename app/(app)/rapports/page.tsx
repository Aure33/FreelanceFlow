import { ReportsHeader } from "@/components/rapports/reports-header";
import { KpiCards } from "@/components/rapports/kpi-cards";
import { RevenueChart } from "@/components/rapports/revenue-chart";
import {
  ClientRevenueCard,
  PaymentDelaysCard,
} from "@/components/rapports/premium-cards";
import { parseReportsPeriod } from "@/lib/periods";
import { getReportsData } from "./actions";

export default async function RapportsPage({
  searchParams,
}: {
  searchParams: { periode?: string };
}) {
  // Segment de période (#65) : sélection dans l'URL, whitelist stricte côté
  // serveur (défaut « annee »).
  const period = parseReportsPeriod(searchParams.periode);
  const data = await getReportsData(period);

  return (
    <>
      <ReportsHeader
        year={data.year}
        period={data.period}
        subtitle={data.labels.subtitle}
      />

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
