import { cn } from "@/lib/utils";

// Teintes possibles d'un tag (pastille de statut). Co-localisé avec le composant
// Tag qui les consomme ; réutilisé par les métadonnées de statut documents/projets.
export type TagTone = "ok" | "warn" | "danger" | "neutral" | "accent";

// Badge de statut (pastille + libellé) — reproduit `.tag` de freelance-flow.css.
const TONE_CLASSES: Record<TagTone, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
};

export function Tag({
  tone,
  children,
  className,
}: {
  tone: TagTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12.5px] font-semibold",
        TONE_CLASSES[tone],
        className
      )}
    >
      {/* Pastille (::before de la maquette) */}
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-current" />
      {children}
    </span>
  );
}
