"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";

// Liste complète d'un bloc Premium des rapports (répartition du CA, délais de
// paiement) : la carte n'affiche que le top 4, ce bouton ouvre tous les
// clients, même tri, chaque ligne menant à la fiche client. Les lignes sont
// déjà formatées par le composant serveur : rien n'est recalculé ici.
export type ClientListRow = {
  clientId: string;
  clientName: string;
  value: string;
  width: number; // % de la barre, relatif au maximum de la liste
  barClass: string; // couleur de barre (token)
};

export function ClientListDialog({
  title,
  rows,
}: {
  title: string;
  rows: ClientListRow[];
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface print:hidden"
      >
        Voir les {rows.length} clients
      </button>
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        titleId={titleId}
      >
        <ul className="px-6 py-4">
          {rows.map((r) => (
            <li key={r.clientId}>
              <Link
                href={`/clients/${r.clientId}`}
                className="-mx-2 flex items-center gap-3 rounded-md px-2 py-[7px] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="w-[150px] truncate text-[13.5px] font-semibold">
                  {r.clientName}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <i
                    className={`block h-full rounded-full ${r.barClass}`}
                    style={{ width: `${r.width}%` }}
                  />
                </span>
                <span className="num w-20 text-right text-xs text-ink-3">
                  {r.value}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ModalShell>
    </>
  );
}
