import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/errors/error-state";

// 404 du groupe (app) (issue #67) — rendue DANS le shell applicatif
// (sidebar + topbar préservées, cf. app/(app)/layout.tsx). C'est cette page
// que voit l'utilisateur quand une fiche est inexistante ou n'est pas la
// sienne (le filtre `where: { userId }` renvoie null → `notFound()`, cf. #56) :
// aucune donnée n'est divulguée, seulement « introuvable ».

export default function AppNotFound() {
  return (
    <ErrorState
      code="404"
      title="Page introuvable"
      description="Ce contenu n'existe pas, a été supprimé, ou ne fait pas partie de votre compte."
      actions={
        <Button asChild variant="primary">
          <Link href="/dashboard">Retour au tableau de bord</Link>
        </Button>
      }
    />
  );
}
