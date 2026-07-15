import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listInvoiceSummary,
  getDocumentCounts,
} from "@/app/(app)/documents/actions";
import { getUsage } from "@/app/(app)/abonnement/actions";

// Liste des factures (server component) : données réelles filtrées `where { userId }`
// via les server actions. Filtre de statut + pagination portés par l'URL
// (`?statut=`, `?page=`, issue #70) ; le bandeau, les chips et la navigation
// vers la vue Document sont délégués au composant client DocumentList.
// `usage` alimente le garde-fou et la bannière de limite atteinte (issue #10).
export default async function FacturesPage({
  searchParams,
}: {
  searchParams: { page?: string | string[]; statut?: string | string[] };
}) {
  const [list, summary, counts, usage] = await Promise.all([
    listDocuments("facture", {
      page: searchParams.page,
      status: searchParams.statut,
    }),
    listInvoiceSummary(),
    getDocumentCounts("facture"),
    getUsage(),
  ]);

  return (
    <DocumentList
      type="facture"
      items={list.items}
      pagination={list.pagination}
      summary={summary}
      counts={counts}
      usage={usage}
    />
  );
}
