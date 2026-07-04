import dynamic from "next/dynamic";
import { listProjectsForPicker } from "@/app/(app)/documents/actions";
import { getCurrentUserProfile, requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { TvaRegime } from "@/lib/invoicing";

// Éditeur chargé en `next/dynamic` (éco-conception) : composant client lourd
// (état + aperçu live), isolé du reste du bundle applicatif.
const DocumentEditor = dynamic(() =>
  import("@/components/documents/document-editor").then(
    (m) => m.DocumentEditor,
  ),
);

// Sécurise le régime lu en base vers l'union typée (défaut : reel), aligné sur
// la normalisation appliquée côté server actions.
function normalizeRegime(value: string | null | undefined): TvaRegime {
  return value === "franchise" || value === "normal" ? value : "reel";
}

export default async function NouveauDocumentPage({
  searchParams,
}: {
  searchParams: { projet?: string; type?: string };
}) {
  const userId = await requireUserId();

  const [projects, profile, me] = await Promise.all([
    listProjectsForPicker(),
    getCurrentUserProfile(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { tvaRegime: true },
    }),
  ]);

  // Présélection depuis un point d'entrée. On ne garde le projet que s'il
  // appartient bien au user (présent dans la liste filtrée `userId`).
  const initialProjectId = projects.some((p) => p.id === searchParams.projet)
    ? searchParams.projet
    : undefined;
  const initialType =
    searchParams.type === "devis" || searchParams.type === "facture"
      ? searchParams.type
      : undefined;

  return (
    <DocumentEditor
      projects={projects}
      emitterName={profile?.name ?? "Vous"}
      regime={normalizeRegime(me?.tvaRegime)}
      initialProjectId={initialProjectId}
      initialType={initialType}
    />
  );
}
