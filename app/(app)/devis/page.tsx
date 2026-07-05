import { DocumentList } from "@/components/documents/document-list";
import {
  listDocuments,
  listQuoteSummary,
} from "@/app/(app)/documents/actions";
import { getUsage } from "@/app/(app)/abonnement/actions";

// Liste des devis (server component) : données réelles filtrées `where { userId }`
// via les server actions. Bandeau de synthèse (pipeline), chips de filtre et
// navigation vers la vue Document délégués au composant client DocumentList.
// `usage` alimente le garde-fou et la bannière de limite atteinte (issue #10).
export default async function DevisPage() {
  const [items, summary, usage] = await Promise.all([
    listDocuments("devis"),
    listQuoteSummary(),
    getUsage(),
  ]);

  return (
    <DocumentList type="devis" items={items} summary={summary} usage={usage} />
  );
}
