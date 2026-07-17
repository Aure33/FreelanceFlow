import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { EditClientButton } from "@/components/clients/edit-client-modal";
import { ClientBreadcrumb } from "@/components/clients/client-breadcrumb";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { formatSiret } from "@/components/clients/format";
import { statusMeta } from "@/components/documents/status";
import { formatListDate } from "@/components/documents/format";
import { STATUS_META as PROJECT_STATUS_META } from "@/components/projets/status";
import { formatEuros } from "@/lib/invoicing";
import { getClientFiche } from "../actions";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const fiche = await getClientFiche(params.id);
  if (!fiche) notFound();
  const { client, stats, projects, documents } = fiche;

  // Tuiles de stats — agrégats réels en HT (convention #47), délai en jours.
  const tiles = [
    {
      l: `CA ${stats.year}`,
      v: formatEuros(stats.caYearHtCents),
      d:
        stats.caYearHtCents > 0
          ? "HT encaissé cette année"
          : "Dès votre première facture",
    },
    {
      l: "En attente de paiement",
      v: formatEuros(stats.pendingHtCents),
      d:
        stats.pendingHtCents > 0
          ? "HT · factures non réglées"
          : "Rien à encaisser",
    },
    {
      l: "Pièces émises",
      v: String(stats.emittedCount),
      d: stats.emittedCount > 0 ? "devis et factures" : "Aucun document",
    },
    {
      l: "Délai moyen de paiement",
      v: stats.avgPaymentDays === null ? "—" : `${stats.avgPaymentDays} j`,
      d: stats.avgPaymentDays === null ? "—" : "sur factures réglées",
    },
  ];

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
        {/* « Modifier » ouvre la modale d'édition/suppression (#58). « Nouveau
            devis / facture » ouvrent l'éditeur (#8) — le projet (qui porte le
            client) se choisit dans l'éditeur, un client pouvant avoir
            plusieurs projets. */}
        <div className="ml-auto flex items-center gap-2.5">
          <EditClientButton client={client} />
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

      {/* Stats — agrégats réels (issue #86) */}
      <section className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2">
        {tiles.map((s) => (
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
              <span className="text-[13px] text-ink-3">
                {projects.length === 0
                  ? "Aucun projet"
                  : `${projects.length} projet${projects.length > 1 ? "s" : ""}`}
              </span>
            </div>
            {projects.length === 0 ? (
              <div className="px-pad py-10 text-center text-sm text-ink-3">
                Aucun projet rattaché à ce client pour l&apos;instant.
              </div>
            ) : (
              <ul className="[&>li:last-child]:border-b-0">
                {projects.map((p) => {
                  const meta = PROJECT_STATUS_META[p.status];
                  return (
                    <li key={p.id} className="border-b border-line-soft">
                      <Link
                        href={`/projets/${p.id}`}
                        className="flex items-center gap-3 px-pad py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-[600]">
                          {p.name}
                        </span>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Historique des pièces
              </h2>
              <span className="text-[13px] text-ink-3">
                {documents.length === 0
                  ? "Aucun document"
                  : `${documents.length} dernière${documents.length > 1 ? "s" : ""}`}
              </span>
            </div>
            {documents.length === 0 ? (
              <div className="px-pad py-10 text-center text-sm text-ink-3">
                Aucun devis ni facture émis pour ce client.
              </div>
            ) : (
              <ul className="[&>li:last-child]:border-b-0">
                {documents.map((d) => {
                  const meta = statusMeta(d.type, d.status);
                  const path = d.type === "facture" ? "factures" : "devis";
                  return (
                    <li key={d.id} className="border-b border-line-soft">
                      <Link
                        href={`/${path}/${d.id}`}
                        className="flex items-center gap-3 px-pad py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="num w-[130px] flex-none truncate text-[13px] font-medium text-ink-2">
                          {d.number ?? (
                            <span className="italic text-ink-3">Brouillon</span>
                          )}
                        </span>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                        <span className="ml-auto whitespace-nowrap text-[12.5px] text-ink-3">
                          {formatListDate(d.issuedAt)}
                        </span>
                        <span className="num w-[110px] flex-none text-right text-sm font-semibold">
                          {formatEuros(d.totalTtcCents)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
