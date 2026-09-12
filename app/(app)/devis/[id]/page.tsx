import { notFound } from "next/navigation";
import { DocumentView } from "@/components/documents/document-view";
import { getDocument } from "@/app/(app)/documents/actions";

// Vue d'un devis (server component). getDocument filtre déjà `where { userId }` :
// un id d'un autre utilisateur (ou invalide) renvoie null → 404. On vérifie aussi
// le type pour qu'une facture ne s'ouvre pas sous la route /devis.
// L'envoi par e-mail (#83) rend le PDF depuis cette page : démarrage à froid
// de Chromium en production (#103).
export const maxDuration = 60;

export default async function DevisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const view = await getDocument(params.id);
  if (!view || view.type !== "devis") notFound();

  return <DocumentView view={view} />;
}
