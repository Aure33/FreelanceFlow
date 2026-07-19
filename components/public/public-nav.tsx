import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PublicNavProps = {
  // Landing : nav collante avec fond translucide + backdrop-blur.
  sticky?: boolean;
  // Landing : affiche les liens « Fonctionnalités » et « Tarifs ».
  showLinks?: boolean;
};

// Barre de navigation publique partagée (landing + pages légales).
export function PublicNav({ sticky = false, showLinks = false }: PublicNavProps) {
  return (
    <header
      className={cn(
        "flex items-center",
        sticky
          ? // Fond translucide via token (color-mix) pour rester correct en clair ET sombre.
            "sticky top-0 z-20 h-[68px] gap-4 border-b sm:gap-7 border-line-soft bg-[color-mix(in_oklch,var(--bg)_85%,transparent)] px-[max(28px,calc((100vw-1080px)/2))] backdrop-blur-[8px]"
          : "mx-auto w-full max-w-[1020px] gap-4 px-4 py-[18px] sm:gap-[26px] sm:px-7"
      )}
    >
      {/* Marque */}
      <Link href="/" className="flex items-center gap-[11px]">
        <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-accent text-base font-extrabold text-on-accent shadow-sm">
          F
        </div>
        <div className="hidden text-base font-bold tracking-[-0.02em] sm:block">
          Freelance<span className="text-accent-ink">Flow</span>
        </div>
      </Link>

      {showLinks && (
        <nav className="ml-[18px] hidden gap-[22px] md:flex" aria-label="Sections du site">
          <a
            href="#fonctions"
            className="text-sm font-[550] text-ink-2 transition-colors hover:text-ink"
          >
            Fonctionnalités
          </a>
          <Link
            href="/abonnement"
            className="text-sm font-[550] text-ink-2 transition-colors hover:text-ink"
          >
            Tarifs
          </Link>
        </nav>
      )}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
        {/* prefetch=false : /connexion et /inscription arrivent en #3 — évite les 404 de prefetch */}
        <Button asChild variant="ghost">
          <Link href="/connexion" prefetch={false}>
            Se connecter
          </Link>
        </Button>
        <Button asChild variant="primary">
          <Link href="/inscription" prefetch={false}>
            Essayer gratuitement
          </Link>
        </Button>
      </div>
    </header>
  );
}
