import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listQuoteSummary,
} from "@/app/(app)/documents/actions";

// Liste des devis (server component) : données réelles filtrées `where { userId }`
// via les server actions. Bandeau de synthèse (pipeline), chips de filtre et
// navigation vers la vue Document délégués au composant client DocumentList.
export default async function DevisPage() {
  const [items, summary] = await Promise.all([
    listDocuments("devis"),
    listQuoteSummary(),
  ]);

  return <DocumentList type="devis" items={items} summary={summary} />;
}
