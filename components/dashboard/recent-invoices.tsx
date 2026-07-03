import Link from "next/link";
import { RECENT_INVOICES } from "./mock-data";
import { Tag } from "./tag";

// Tableau des factures récentes (carte sur 2 colonnes du bandeau bas).
export function RecentInvoices() {
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
          {RECENT_INVOICES.map((inv) => (
            <tr
              key={inv.ref}
              className="transition-colors hover:bg-surface-2"
            >
              <td className="num whitespace-nowrap border-b border-line-soft px-pad py-3.5 text-sm">
                {inv.ref}
              </td>
              <td className="border-b border-line-soft px-pad py-3.5 text-sm">
                {inv.client}
              </td>
              <td className="border-b border-line-soft px-pad py-3.5 text-sm text-ink-3">
                {inv.due}
              </td>
              <td className="border-b border-line-soft px-pad py-3.5 text-sm">
                <Tag tone={inv.status.tone}>{inv.status.label}</Tag>
              </td>
              <td className="num border-b border-line-soft px-pad py-3.5 text-right text-sm font-semibold">
                {inv.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
