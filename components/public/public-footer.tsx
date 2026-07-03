import { cn } from "@/lib/utils";

type PublicFooterProps = {
  // Ajuste la largeur du conteneur pour coller à celle du contenu de la page.
  className?: string;
};

// Pied de page public partagé (landing + pages légales).
export function PublicFooter({ className }: PublicFooterProps) {
  return (
    <footer className={cn("mx-auto max-w-[1080px] px-7", className)}>
      <div className="flex items-center gap-5 border-t border-line-soft pb-[34px] pt-[26px] text-[13px] text-ink-3">
        <span>© 2026 Freelance Flow</span>
        <nav className="ml-auto flex gap-[18px]" aria-label="Liens légaux">
          {/* Ancres natives : sur /legal, le changement de hash déclenche
              hashchange (navigation entre documents) sans rechargement. */}
          <a href="/legal#cgu" className="transition-colors hover:text-ink">
            CGU
          </a>
          <a
            href="/legal#confidentialite"
            className="transition-colors hover:text-ink"
          >
            Confidentialité
          </a>
          <a
            href="mailto:contact@freelanceflow.fr"
            className="transition-colors hover:text-ink"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
