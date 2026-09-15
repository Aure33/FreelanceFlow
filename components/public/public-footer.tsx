import { cn } from "@/lib/utils";
import { LegalLinks } from "./legal-links";

type PublicFooterProps = {
  // Ajuste la largeur du conteneur pour coller à celle du contenu de la page.
  className?: string;
};

// Pied de page public partagé (landing + pages légales).
export function PublicFooter({ className }: PublicFooterProps) {
  return (
    <footer className={cn("mx-auto max-w-[1080px] px-7", className)}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-soft pb-[34px] pt-[26px] text-[13px] text-ink-3">
        <span>© 2026 Freelance Flow</span>
        <nav className="ml-auto flex flex-wrap gap-x-[18px] gap-y-1" aria-label="Liens légaux">
          <LegalLinks />
          <a
            href="https://github.com/Aure33/FreelanceFlow/issues"
            rel="noopener"
            className="transition-colors hover:text-ink"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
