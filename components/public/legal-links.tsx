import { cn } from "@/lib/utils";

// Liens vers les trois documents légaux du site (/legal), affichés sur toutes
// les surfaces : pied de page public, barre latérale de l'application connectée,
// page publique d'un devis. Les mentions légales doivent être accessibles depuis
// chaque page (LCEN, art. 6).
//
// Ancres natives (pas de next/link) : sur /legal, le changement de hash déclenche
// hashchange (navigation entre documents) sans rechargement.
const LINKS = [
  { href: "/legal#mentions", label: "Mentions légales" },
  { href: "/legal#cgu", label: "CGU" },
  { href: "/legal#confidentialite", label: "Confidentialité" },
];

export function LegalLinks({ linkClassName }: { linkClassName?: string }) {
  return (
    <>
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={cn("transition-colors hover:text-ink", linkClassName)}
        >
          {l.label}
        </a>
      ))}
    </>
  );
}
