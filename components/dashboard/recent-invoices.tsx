import Link from "next/link";
import { formatEuros } from "@/lib/invoicing";
import { formatListDate } from "@/components/documents/format";
import { statusMeta } from "@/components/documents/status";
import type { DashboardData } from "@/app/(app)/dashboard/actions";
import { Tag } from "./tag";

// Tableau des factures récentes (carte sur 2 colonnes du bandeau bas).
export function RecentInvoices({
  invoices,
}: {
  invoices: DashboardData["recentInvoices"];
}) {
  return (
    <div className="col-span-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm max-[1100px]:col-span-1">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">
          Factures récentes
        </h2>
        <Link
          href="/factures"
          className="ml-auto text-[13px] font-semibold text-accent-ink"
        >
          Tout voir
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div className="px-pad py-[26px] text-center text-[13px] text-ink-3">
          Aucune facture émise pour le moment
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Pièce", "Client", "Échéance", "Statut"].map((h) => (
                <th
                  key={h}
                  className="border-b border-line-soft px-pad py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"
                >
                  {h}
                </th>
              ))}
              <th className="border-b border-line-soft px-pad py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Montant TTC
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {invoices.map((inv) => {
              const meta = statusMeta("facture", inv.status);
              return (
                <tr key={inv.id} className="transition-colors hover:bg-surface-2">
                  <td className="num relative whitespace-nowrap border-b border-line-soft px-pad py-3.5 text-sm">
                    {/* Recouvre toute la ligne pour la rendre cliquable sans casser le rendu */}
                    <Link
                      href={`/factures/${inv.id}`}
                      className="absolute inset-0"
                      aria-label={`Ouvrir la facture ${inv.number}`}
                    />
                    {inv.number}
                  </td>
                  <td className="border-b border-line-soft px-pad py-3.5 text-sm">
                    {inv.clientName}
                  </td>
                  <td className="border-b border-line-soft px-pad py-3.5 text-sm text-ink-3">
                    {formatListDate(inv.dueAt)}
                  </td>
                  <td className="border-b border-line-soft px-pad py-3.5 text-sm">
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                  </td>
                  <td className="num border-b border-line-soft px-pad py-3.5 text-right text-sm font-semibold">
                    {formatEuros(inv.amountTtcCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
