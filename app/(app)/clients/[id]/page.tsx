import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientBreadcrumb } from "@/components/clients/client-breadcrumb";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { formatSiret } from "@/components/clients/format";
import { getClient } from "../actions";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const client = await getClient(params.id);
  if (!client) notFound();

  return (
    <>
      <ClientBreadcrumb current={client.name} />

      {/* En-tête client (`.client-head`) */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <ClientAvatar name={client.name} seed={client.id} size="lg" />
        <div>
          <div className="text-2xl font-extrabold leading-[1.2] tracking-[-0.03em]">
            {client.name}
          </div>
          <div className="mt-0.5 text-sm text-ink-3">
            {client.sector ?? "Client professionnel"}
          </div>
        </div>
        {/* « Modifier » (drawer d'édition) reste à faire. « Nouveau devis /
            facture » ouvrent l'éditeur (#8) — le projet (qui porte le client)
            se choisit dans l'éditeur, un client pouvant avoir plusieurs projets. */}
        <div className="ml-auto flex items-center gap-2.5">
          <Button type="button" variant="default" disabled title="Bientôt disponible">
            <Pencil strokeWidth={2} />
            Modifier
          </Button>
          <Button asChild variant="default">
            <Link href="/documents/nouveau?type=devis">Nouveau devis</Link>
          </Button>
          <Button asChild variant="primary">
            <Link href="/documents/nouveau?type=facture">
              <Plus strokeWidth={2} />
              Nouvelle facture
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats — nuls tant que les documents ne sont pas modélisés (#7) */}
      <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2">
        {[
          { l: "CA 2026", v: "—", d: "Dès votre première facture" },
          { l: "En attente de paiement", v: "—", d: "Rien à encaisser" },
          { l: "Pièces émises", v: "0", d: "Aucun document" },
          { l: "Délai moyen de paiement", v: "—", d: "—" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-lg border border-line bg-surface px-5 py-4 shadow-sm"
          >
            <div className="text-[12.5px] font-semibold text-ink-3">{s.l}</div>
            <div className="num mt-[3px] text-[21px] font-semibold tracking-[-0.01em]">
              {s.v}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">{s.d}</div>
          </div>
        ))}
      </section>

      {/* Colonnes info / activité */}
      <div className="grid grid-cols-[360px_1fr] items-start gap-gap max-[1100px]:grid-cols-1">
        {/* ===== Colonne info ===== */}
        <div className="flex min-w-0 flex-col gap-gap">
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">Coordonnées</h2>
            </div>
            <div className="p-pad">
              <dl className="grid grid-cols-[120px_1fr] gap-y-[11px] text-sm">
                <dt className="text-ink-3">E-mail</dt>
                <dd className="font-[550] [overflow-wrap:anywhere]">
                  {client.email ?? "—"}
                </dd>
                <dt className="text-ink-3">Téléphone</dt>
                <dd className="num text-[13px] font-[550]">{client.phone ?? "—"}</dd>
                <dt className="text-ink-3">Adresse</dt>
                <dd className="font-[550] [overflow-wrap:anywhere]">
                  {client.address ?? "—"}
                </dd>
              </dl>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Informations légales
              </h2>
            </div>
            <div className="p-pad">
              <dl className="grid grid-cols-[120px_1fr] gap-y-[11px] text-sm">
                <dt className="text-ink-3">SIRET</dt>
                <dd className="num text-[13px] font-[550]">
                  {client.siret ? formatSiret(client.siret) : "—"}
                </dd>
                <dt className="text-ink-3">Conditions</dt>
                <dd className="font-[550]">
                  {client.paymentTerms ?? "—"}
                </dd>
              </dl>
            </div>
          </section>
        </div>

        {/* ===== Colonne activité ===== */}
        <div className="flex min-w-0 flex-col gap-gap">
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">Projets</h2>
              <span className="text-[13px] text-ink-3">Aucun projet</span>
            </div>
            <div className="px-pad py-10 text-center text-sm text-ink-3">
              Aucun projet rattaché à ce client pour l&apos;instant.
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Historique des pièces
              </h2>
              <span className="text-[13px] text-ink-3">Aucun document</span>
            </div>
            <div className="px-pad py-10 text-center text-sm text-ink-3">
              Aucun devis ni facture émis pour ce client.
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
