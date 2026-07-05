import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listInvoiceSummary,
} from "@/app/(app)/documents/actions";
import { getUsage } from "@/app/(app)/abonnement/actions";

// Liste des factures (server component) : données réelles filtrées `where { userId }`
// via les server actions. Le bandeau de synthèse, les chips de filtre et la
// navigation vers la vue Document sont délégués au composant client DocumentList.
// `usage` alimente le garde-fou et la bannière de limite atteinte (issue #10).
export default async function FacturesPage() {
  const [items, summary, usage] = await Promise.all([
    listDocuments("facture"),
    listInvoiceSummary(),
    getUsage(),
  ]);

  return (
    <DocumentList type="facture" items={items} summary={summary} usage={usage} />
  );
}
