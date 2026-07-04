import { ProjectBoard } from "@/components/projets/project-board";
import { listProjects, listClientOptions } from "./actions";

// Liste des projets (server component) : données réelles filtrées `where { userId }`
// via les server actions. La bascule de vue, les filtres et la modale de création
// sont délégués au composant client ProjectBoard. Les clients sont chargés ici
// pour peupler le sélecteur de la modale.
export default async function ProjetsPage() {
  const [projects, clients] = await Promise.all([
    listProjects(),
    listClientOptions(),
  ]);

  return <ProjectBoard projects={projects} clients={clients} />;
}
