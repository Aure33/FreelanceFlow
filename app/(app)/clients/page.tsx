import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientList } from "@/components/clients/client-list";
import { listClients } from "./actions";

export default async function ClientsPage() {
  const clients = await listClients();
  const count = clients.length;

  return (
    <>
      {/* En-tête de page (`.page-head`) */}
      <div className="mb-[22px] flex items-center gap-[18px]">
        <div>
          <div className="text-2xl font-extrabold tracking-[-0.03em]">Clients</div>
          <div className="mt-[3px] text-sm text-ink-3">
            {count} client{count > 1 ? "s" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <Button asChild variant="primary">
            <Link href="/clients/nouveau">
              <Plus strokeWidth={2} />
              Nouveau client
            </Link>
          </Button>
        </div>
      </div>

      {count === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface px-6 py-16 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Users className="h-6 w-6" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-bold tracking-[-0.02em]">
            Aucun client pour l&apos;instant
          </h2>
          <p className="mt-1.5 max-w-[340px] text-sm text-ink-3">
            Ajoutez votre premier client pour commencer à créer des devis et des
            factures.
          </p>
          <Button asChild variant="primary" className="mt-5">
            <Link href="/clients/nouveau">
              <Plus strokeWidth={2} />
              Nouveau client
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Filtres — décoratifs : seul « Tous » est présent, l'archivage et le
              statut (impayés / inactifs) ne sont pas modélisés (dépend des
              documents, #7). On n'affiche donc pas de chips à compteurs fictifs. */}
          <div className="mb-4 flex items-center gap-2.5">
            <span className="inline-flex h-[34px] items-center gap-[7px] rounded-full border border-ink bg-ink px-3.5 text-[13px] font-semibold text-bg">
              Tous <span className="num text-[11.5px] opacity-70">{count}</span>
            </span>
          </div>

          <ClientList clients={clients} />
        </>
      )}
    </>
  );
}
