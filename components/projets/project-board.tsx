"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ListFilter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { cn } from "@/lib/utils";
import type {
  ClientOption,
  ProjectListItem,
} from "@/app/(app)/projets/actions";
import { STATUS_META, formatProjectDate } from "./status";
import { NewProjectModal } from "./new-project-modal";

type View = "grille" | "kanban";
type Filter = "all" | "encours" | "termine";

// Vue Projets : bascule Grille / Kanban, filtres par statut, cartes cliquables
// et modale de création. Client car toute l'interactivité (état de vue, filtre,
// ouverture de la modale) vit ici. Les données arrivent du server component.
export function ProjectBoard({
  projects,
  clients,
}: {
  projects: ProjectListItem[];
  clients: ClientOption[];
}) {
  const [view, setView] = useState<View>("grille");
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);

  const count = projects.length;
  const enCours = projects.filter((p) => p.status === "en_cours").length;
  const termine = projects.filter((p) => p.status === "termine").length;

  // Filtre appliqué à la grille. Le Kanban regroupe TOUS les projets par statut
  // (le filtre n'y a pas de sens : les chips sont masquées dans cette vue, comme
  // dans la maquette).
  const filtered = projects.filter((p) =>
    filter === "all"
      ? true
      : filter === "encours"
        ? p.status === "en_cours"
        : p.status === "termine",
  );

  const chipBase =
    "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors";

  return (
    <>
      {/* En-tête de page (`.page-head`) */}
      <div className="mb-[22px] flex items-center gap-[18px]">
        <div>
          <div className="text-2xl font-extrabold tracking-[-0.03em]">Projets</div>
          <div className="mt-[3px] text-sm text-ink-3">
            {count} projet{count > 1 ? "s" : ""}
            {count > 0 ? ` · ${enCours} en cours` : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {count > 0 && (
            <div
              role="radiogroup"
              aria-label="Type d'affichage"
              className="inline-flex rounded-md border border-line bg-surface-2 p-[3px]"
            >
              {(["grille", "kanban"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-[7px] px-3.5 py-1.5 text-[13px] font-semibold capitalize transition-colors",
                    view === v
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <Button type="button" variant="primary" onClick={() => setModalOpen(true)}>
            <Plus strokeWidth={2} />
            Nouveau projet
          </Button>
        </div>
      </div>

      {count === 0 ? (
        // État vide
        <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface px-6 py-16 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <FileText className="h-6 w-6" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-bold tracking-[-0.02em]">
            Aucun projet pour l&apos;instant
          </h2>
          <p className="mt-1.5 max-w-[360px] text-sm text-ink-3">
            Créez un projet pour regrouper vos devis et vos factures par mission.
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-5"
            onClick={() => setModalOpen(true)}
          >
            <Plus strokeWidth={2} />
            Nouveau projet
          </Button>
        </div>
      ) : (
        <>
          {/* Filtres (`.filters`) */}
          <div className="mb-[18px] flex items-center gap-2.5">
            {view === "grille" && (
              <>
                {(
                  [
                    { id: "all", label: "Tous", n: count },
                    { id: "encours", label: "En cours", n: enCours },
                    { id: "termine", label: "Terminés", n: termine },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilter(c.id)}
                    aria-pressed={filter === c.id}
                    className={cn(
                      chipBase,
                      filter === c.id
                        ? "border-ink bg-ink text-bg"
                        : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {c.label} <span className="num text-[11.5px] opacity-70">{c.n}</span>
                  </button>
                ))}
              </>
            )}
            {/* Tri : décoratif (aucune spec de comportement dans la maquette) */}
            <span
              className={cn(
                chipBase,
                "ml-auto border-line bg-surface text-ink-2",
              )}
            >
              <ListFilter className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Trier : activité récente
            </span>
          </div>

          {view === "grille" ? (
            <div className="grid grid-cols-3 gap-gap max-[1180px]:grid-cols-2 max-[800px]:grid-cols-1">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              {/* Carte « Nouveau projet » (`.proj-new`) */}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex min-h-[178px] flex-col items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-line text-sm font-semibold text-ink-3 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
              >
                <span className="grid h-[38px] w-[38px] place-items-center rounded-full border-[1.5px] border-current">
                  <Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </span>
                Nouveau projet
              </button>
            </div>
          ) : (
            <KanbanBoard projects={projects} />
          )}
        </>
      )}

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        clients={clients}
      />
    </>
  );
}

// —— Carte de la grille (`.proj`) ——
function ProjectCard({ project }: { project: ProjectListItem }) {
  const meta = STATUS_META[project.status];
  const done = project.status === "termine";
  const full = project.progress >= 100;

  return (
    <Link
      href={`/projets/${project.id}`}
      className={cn(
        "flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5 shadow-sm outline-none transition-[box-shadow,transform,border-color,opacity] hover:-translate-y-0.5 hover:border-accent-line hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        done && "opacity-[0.82] hover:opacity-100",
      )}
    >
      <div className="flex items-start gap-3">
        <ClientAvatar name={project.clientName} seed={project.clientName} size="proj" />
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-bold leading-[1.3] tracking-[-0.01em]">
            {project.name}
          </b>
          <small className="text-[13px] text-ink-3">{project.clientName}</small>
        </div>
        <Tag tone={meta.tone} className="flex-none">
          {meta.label}
        </Tag>
      </div>

      <div>
        {/* Montant : placeholder tant que les documents ne sont pas modélisés (#8) */}
        <div className="flex items-baseline gap-[7px]">
          <span className="num text-[17px] font-semibold text-ink-3">—</span>
          <span className="text-[12.5px] text-ink-3">à facturer</span>
        </div>
        {/* Barre d'avancement (progress réel) */}
        <div className="mt-[9px] h-[7px] overflow-hidden rounded-full bg-surface-2">
          <span
            className={cn(
              "block h-full rounded-full",
              full ? "bg-ok" : "bg-accent",
            )}
            style={{ width: `${Math.min(project.progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-0.5 flex items-center gap-[9px] text-[12.5px] text-ink-3">
        <span className="inline-flex items-center gap-[5px]">
          <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {project.documentsCount > 0
            ? `${project.documentsCount} document${project.documentsCount > 1 ? "s" : ""}`
            : "Aucun document"}
        </span>
        <span className="num ml-auto">{formatProjectDate(project.createdAt)}</span>
      </div>
    </Link>
  );
}

// —— Vue Kanban (`.kanban`) : regroupement visuel en lecture, PAS de drag-drop ——
function KanbanBoard({ projects }: { projects: ProjectListItem[] }) {
  const columns = [
    { status: "en_cours" as const },
    { status: "termine" as const },
    { status: "en_pause" as const },
  ];

  return (
    <div className="grid grid-cols-3 items-start gap-gap max-[1180px]:grid-cols-1">
      {columns.map((col) => {
        const items = projects.filter((p) => p.status === col.status);
        const meta = STATUS_META[col.status];
        return (
          <section
            key={col.status}
            className="rounded-lg border border-line-soft bg-surface-2 p-2.5"
          >
            <div className="flex items-center gap-[9px] px-2.5 pb-3 pt-2">
              <span className={cn("h-[9px] w-[9px] flex-none rounded-full", meta.dot)} />
              <b className="text-[13.5px] font-bold tracking-[-0.01em]">{meta.label}</b>
              <span className="num rounded-full border border-line-soft bg-surface px-2 py-px text-[11.5px] font-semibold text-ink-3">
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-[9px]">
              {items.map((p) => (
                <KanbanCard key={p.id} project={p} />
              ))}
              {items.length === 0 && (
                <p className="px-2.5 py-4 text-[12.5px] text-ink-3">Aucun projet</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function KanbanCard({ project }: { project: ProjectListItem }) {
  const full = project.progress >= 100;
  return (
    <Link
      href={`/projets/${project.id}`}
      className="flex flex-col gap-[9px] rounded-md border border-line bg-surface px-3.5 py-[13px] text-left shadow-sm outline-none transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-accent-line hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="text-[14px] font-[650] leading-[1.3] tracking-[-0.01em]">
        {project.name}
      </div>
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <ClientAvatar name={project.clientName} seed={project.clientName} size="xs" />
        {project.clientName}
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn("block h-full rounded-full", full ? "bg-ok" : "bg-accent")}
          style={{ width: `${Math.min(project.progress, 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <span className="num font-semibold text-ink-2">—</span>
        <span className="num ml-auto">{formatProjectDate(project.createdAt)}</span>
      </div>
    </Link>
  );
}
