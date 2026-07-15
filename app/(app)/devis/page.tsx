import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listQuoteSummary,
  getDocumentCounts,
} from "@/app/(app)/documents/actions";
import { getUsage } from "@/app/(app)/abonnement/actions";

// Liste des devis (server component) : données réelles filtrées `where { userId }`
// via les server actions. Filtre de statut + pagination portés par l'URL
// (`?statut=`, `?page=`, issue #70) ; bandeau de synthèse (pipeline), chips et
// navigation vers la vue Document délégués au composant client DocumentList.
// `usage` alimente le garde-fou et la bannière de limite atteinte (issue #10).
export default async function DevisPage({
  searchParams,
}: {
  searchParams: { page?: string | string[]; statut?: string | string[] };
}) {
  const [list, summary, counts, usage] = await Promise.all([
    listDocuments("devis", {
      page: searchParams.page,
      status: searchParams.statut,
    }),
    listQuoteSummary(),
    getDocumentCounts("devis"),
    getUsage(),
  ]);

  return (
    <DocumentList
      type="devis"
      items={list.items}
      pagination={list.pagination}
      summary={summary}
      counts={counts}
      usage={usage}
    />
  );
}
