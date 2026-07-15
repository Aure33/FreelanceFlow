import { ProjectBoard } from "@/components/projets/project-board";
import {
  listProjects,
  listClientOptions,
  getProjectCounts,
} from "./actions";

// Liste des projets (server component) : données réelles filtrées `where { userId }`.
// Tri, filtre de statut et pagination portés par l'URL (`?tri=`, `?statut=`,
// `?page=`, issue #70). La bascule de vue et la modale de création restent
// gérées par le composant client ProjectBoard. Les clients peuplent le
// sélecteur de la modale ; les compteurs alimentent chips et badges Kanban.
export default async function ProjetsPage({
  searchParams,
}: {
  searchParams: {
    page?: string | string[];
    statut?: string | string[];
    tri?: string | string[];
  };
}) {
  const [list, clients, counts] = await Promise.all([
    listProjects({
      page: searchParams.page,
      status: searchParams.statut,
      sort: searchParams.tri,
    }),
    listClientOptions(),
    getProjectCounts(),
  ]);

  return (
    <ProjectBoard
      projects={list.items}
      pagination={list.pagination}
      counts={counts}
      clients={clients}
    />
  );
}
