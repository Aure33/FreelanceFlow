import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import {
  getDraftForEditor,
  listProjectsForPicker,
} from "@/app/(app)/documents/actions";
import { getUsage } from "@/app/(app)/abonnement/actions";
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
  searchParams: { projet?: string; type?: string; document?: string };
}) {
  const userId = await requireUserId();

  // Reprise d'un brouillon existant (#61 : conversion devis → facture, reprise
  // d'un brouillon depuis sa vue). getDraftForEditor est filtré userId + statut
  // « brouillon » : un id d'autrui, inconnu ou déjà émis → null → éditeur vierge
  // impossible à confondre avec le document demandé, on redirige vers la liste.
  const [projects, profile, me, usage, draft] = await Promise.all([
    listProjectsForPicker(),
    getCurrentUserProfile(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { tvaRegime: true },
    }),
    getUsage(),
    searchParams.document
      ? getDraftForEditor(searchParams.document)
      : Promise.resolve(null),
  ]);
  if (searchParams.document && !draft) {
    redirect("/factures");
  }

  // Garde-fou d'accès direct à l'URL (issue #10, AC #2) : la vraie garde de
  // sécurité reste emitDocument() côté serveur — ceci évite juste de rendre
  // l'éditeur pour rien quand on sait déjà que la limite est atteinte. On
  // redirige vers la liste correspondante, qui ouvre la modale paywall via
  // `?limite=1` (cf. DocumentList).
  if (
    usage.planType === "free" &&
    usage.documentsLimit !== null &&
    usage.documentsThisMonth >= usage.documentsLimit
  ) {
    const list = searchParams.type === "devis" ? "devis" : "factures";
    redirect(`/${list}?limite=1`);
  }

  // Présélection depuis un point d'entrée. On ne garde le projet que s'il
  // appartient bien au user (présent dans la liste filtrée `userId`). Un
  // brouillon rechargé impose son projet et son type.
  const initialProjectId = draft
    ? draft.projectId
    : projects.some((p) => p.id === searchParams.projet)
      ? searchParams.projet
      : undefined;
  const initialType = draft
    ? draft.type
    : searchParams.type === "devis" || searchParams.type === "facture"
      ? searchParams.type
      : undefined;

  return (
    <DocumentEditor
      projects={projects}
      emitterName={profile?.name ?? "Vous"}
      regime={normalizeRegime(me?.tvaRegime)}
      initialProjectId={initialProjectId}
      initialType={initialType}
      initialDocument={draft}
    />
  );
}
