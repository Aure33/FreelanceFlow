import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/errors/error-state";

// 404 racine (issue #67) — remplace la page « This page could not be found »
// de Next (anglais) par une page sobre en français. Rendue avec le layout
// racine (sans le shell applicatif) : elle couvre les URL publiques inconnues
// et sert de repli à tout ce qui n'est pas dans le groupe (app).

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg">
      <ErrorState
        code="404"
        title="Page introuvable"
        description="La page que vous cherchez n'existe pas ou a été déplacée."
        actions={
          <Button asChild variant="primary">
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        }
      />
    </main>
  );
}
