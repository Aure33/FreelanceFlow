import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listInvoiceSummary,
} from "@/app/(app)/documents/actions";

// Liste des factures (server component) : données réelles filtrées `where { userId }`
// via les server actions. Le bandeau de synthèse, les chips de filtre et la
// navigation vers la vue Document sont délégués au composant client DocumentList.
export default async function FacturesPage() {
  const [items, summary] = await Promise.all([
    listDocuments("facture"),
    listInvoiceSummary(),
  ]);

  return <DocumentList type="facture" items={items} summary={summary} />;
}
