import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { ProjectBreadcrumb } from "@/components/projets/project-breadcrumb";
import { ProjectTabs } from "@/components/projets/project-tabs";
import { STATUS_META, formatProjectDate } from "@/components/projets/status";
import { getProject } from "../actions";

export default async function ProjetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const meta = STATUS_META[project.status];

  return (
    <>
      <ProjectBreadcrumb current={project.name} />

      {/* En-tête projet (`.proj-head`) */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <ClientAvatar name={project.clientName} seed={project.clientName} size="lg" />
        <div>
          <div className="text-2xl font-extrabold leading-[1.2] tracking-[-0.03em]">
            {project.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-sm text-ink-3">
            <Link
              href={`/clients/${project.clientId}`}
              className="font-semibold text-accent-ink hover:underline"
            >
              {project.clientName}
            </Link>
            <Tag tone={meta.tone}>{meta.label}</Tag>
          </div>
        </div>
        {/* « Modifier » (drawer d'édition) reste à faire ; « Créer un devis /
            une facture » ouvrent l'éditeur (#8) avec ce projet + le type pré-sélectionnés. */}
        <div className="ml-auto flex items-center gap-2.5">
          <Button type="button" variant="default" disabled title="Bientôt disponible">
            <Pencil strokeWidth={2} />
            Modifier
          </Button>
          <Button asChild variant="default">
            <Link href={`/documents/nouveau?projet=${project.id}&type=devis`}>
              Créer un devis
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link href={`/documents/nouveau?projet=${project.id}&type=facture`}>
              <Plus strokeWidth={2} />
              Créer une facture
            </Link>
          </Button>
        </div>
      </div>

      {/* Bandeau financier — placeholders tant que les documents ne sont pas
          modélisés (#8). Seule la barre d'avancement reflète une donnée réelle. */}
      <section className="mb-gap grid grid-cols-[1fr_auto_auto_auto] items-center gap-9 rounded-lg border border-line bg-surface px-pad py-5 shadow-sm max-[1100px]:grid-cols-1 max-[1100px]:gap-3.5">
        <div>
          <span className="num text-2xl font-semibold tracking-[-0.01em] text-ink-3">
            —
          </span>
          <div className="mt-px text-[13px] text-ink-3">
            facturés sur <b className="num text-ink-2">—</b> de budget ·{" "}
            {project.progress} %
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.min(project.progress, 100)}%` }}
            />
          </div>
        </div>
        {[
          { v: "—", l: "encaissés" },
          { v: "—", l: "en attente" },
          { v: "—", l: "restant à facturer" },
        ].map((f) => (
          <div key={f.l} className="text-right max-[1100px]:text-left">
            <div className="num text-base font-semibold text-ink-3">{f.v}</div>
            <div className="text-[12.5px] text-ink-3">{f.l}</div>
          </div>
        ))}
      </section>

      {/* Colonnes principale / secondaire */}
      <div className="grid grid-cols-[1fr_340px] items-start gap-gap max-[1100px]:grid-cols-1">
        {/* ===== Colonne principale ===== */}
        <div className="flex min-w-0 flex-col gap-gap">
          {/* Phases — placeholder neutre (phases non modélisées) */}
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Phases de la mission
              </h2>
              <span className="text-[13px] text-ink-3">Non renseignées</span>
            </div>
            <div className="px-pad py-10 text-center text-sm text-ink-3">
              Le découpage en phases arrivera avec la facturation.
            </div>
          </section>

          {/* Onglets Documents / Notes / Activité */}
          <ProjectTabs notes={project.notes} />
        </div>

        {/* ===== Colonne secondaire ===== */}
        <div className="flex min-w-0 flex-col gap-gap">
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">À propos</h2>
            </div>
            <div className="p-pad">
              <dl className="grid grid-cols-[110px_1fr] gap-y-[11px] text-sm">
                <dt className="text-ink-3">Client</dt>
                <dd>
                  <Link
                    href={`/clients/${project.clientId}`}
                    className="font-semibold text-accent-ink hover:underline"
                  >
                    {project.clientName}
                  </Link>
                </dd>
                <dt className="text-ink-3">Statut</dt>
                <dd className="font-[550]">{meta.label}</dd>
                <dt className="text-ink-3">Créé le</dt>
                <dd className="font-[550]">{formatProjectDate(project.createdAt)}</dd>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
