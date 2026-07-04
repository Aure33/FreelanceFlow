import { notFound } from "next/navigation";
import { DocumentView } from "@/components/documents/document-view";
import { getDocument } from "@/app/(app)/documents/actions";

// Vue d'une facture (server component). getDocument filtre déjà `where { userId }` :
// un id d'un autre utilisateur (ou invalide) renvoie null → 404. On vérifie aussi
// le type pour qu'un devis ne s'ouvre pas sous la route /factures.
export default async function FactureDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const view = await getDocument(params.id);
  if (!view || view.type !== "facture") notFound();

  return <DocumentView view={view} />;
}
