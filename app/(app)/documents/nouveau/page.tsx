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

export default async function NouveauDocumentPage() {
  const userId = await requireUserId();

  const [projects, profile, me] = await Promise.all([
    listProjectsForPicker(),
    getCurrentUserProfile(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { tvaRegime: true },
    }),
  ]);

  return (
    <DocumentEditor
      projects={projects}
      emitterName={profile?.name ?? "Vous"}
      regime={normalizeRegime(me?.tvaRegime)}
    />
  );
}
