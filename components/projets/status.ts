import type { ProjectStatus } from "@/app/(app)/projets/actions";
import type { TagTone } from "@/components/dashboard/mock-data";

// Métadonnées d'affichage d'un statut de projet : libellé exact, teinte du tag
// (`components/dashboard/tag.tsx`) et couleur de la pastille des colonnes Kanban.
// Trois statuts seulement (en_cours | termine | en_pause), tous en tokens.
export const STATUS_META: Record<
  ProjectStatus,
  { label: string; tone: TagTone; dot: string }
> = {
  en_cours: { label: "En cours", tone: "accent", dot: "bg-accent" },
  termine: { label: "Terminé", tone: "ok", dot: "bg-ok" },
  en_pause: { label: "En pause", tone: "warn", dot: "bg-warn" },
};

// Date courte en français (ex. « 4 juil. 2026 »).
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatProjectDate(d: Date): string {
  return dateFmt.format(d);
}
