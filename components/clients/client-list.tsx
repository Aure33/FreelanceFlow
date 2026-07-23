"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientListItem } from "@/app/(app)/clients/actions";
import { ClientAvatar } from "./client-avatar";
import { formatSiret } from "./format";

// Tableau des clients (`.tbl` + `.client-cell`). Composant client car chaque
// ligne est cliquable (navigation vers la fiche). Le nom reste un vrai <Link>
// pour la navigation clavier ; le clic sur la ligne est un confort souris.
//
// Écarts assumés vs maquette : les colonnes « TVA » et « Statut » sont retirées
// (ni le taux de TVA par client ni le statut — qui dépend des documents — ne
// sont modélisés à ce stade). « CA 2026 » affiche « — » (agrégats documents = #7).
export function ClientList({ clients }: { clients: ClientListItem[] }) {
  const router = useRouter();

  return (
    <section tabIndex={0} aria-label="Tableau (défilable horizontalement)" className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-line-soft px-pad py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Client
            </th>
            <th className="border-b border-line-soft px-pad py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3 max-[1100px]:hidden">
              Contact
            </th>
            <th className="border-b border-line-soft px-pad py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              SIRET
            </th>
            <th className="border-b border-line-soft px-pad py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              CA 2026
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {clients.map((client) => (
            <tr
              key={client.id}
              onClick={() => router.push(`/clients/${client.id}`)}
              className="cursor-pointer transition-colors hover:bg-surface-2"
            >
              <td className="border-b border-line-soft px-pad py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <ClientAvatar name={client.name} seed={client.id} />
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${client.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate text-[14.5px] font-[650] leading-[1.25] outline-none hover:text-accent-ink focus-visible:text-accent-ink focus-visible:underline"
                    >
                      {client.name}
                    </Link>
                    <small className="text-[12.5px] text-ink-3">
                      {client.sector ?? "—"}
                    </small>
                  </div>
                </div>
              </td>
              <td className="border-b border-line-soft px-pad py-3.5 max-[1100px]:hidden">
                {client.email || client.phone ? (
                  <div className="text-[13.5px]">
                    {client.email ?? client.phone}
                    {client.email && client.phone ? (
                      <small className="block text-[12.5px] text-ink-3">
                        {client.phone}
                      </small>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="border-b border-line-soft px-pad py-3.5">
                {client.siret ? (
                  <span className="num whitespace-nowrap text-[12.5px] tracking-[0.02em] text-ink-2">
                    {formatSiret(client.siret)}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="num border-b border-line-soft px-pad py-3.5 text-right text-ink-3">
                —
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 px-pad py-3.5 text-[13px] text-ink-3">
        <span>
          {clients.length} client{clients.length > 1 ? "s" : ""}
        </span>
      </div>
    </section>
  );
}
