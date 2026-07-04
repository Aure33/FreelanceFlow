import type { DocType } from "@/lib/invoicing";
import type { TagTone } from "@/components/dashboard/mock-data";
import type { DocumentStatus } from "@/app/(app)/documents/actions";

// Statut effectif d'un document → pastille (ton + libellé), aligné sur le tableau
// des statuts (README design §10) et les maquettes Factures/Devis/Document.
//
// Choix assumé : pour une facture « envoye » non échue, on affiche « En attente »
// (ton warn), qui reflète l'attente de paiement — comme la liste Factures.html.
// Pour un devis « accepte », on suit la maquette Devis.html qui le marque en OK
// (vert) et non en accent : un devis accepté est une issue positive. L'instruction
// de tâche regroupait « envoyé/accepté = accent » ; la maquette prime (cf. CLAUDE.md).
export type StatusMeta = { tone: TagTone; label: string };

const FACTURE_META: Record<DocumentStatus, StatusMeta> = {
  brouillon: { tone: "neutral", label: "Brouillon" },
  envoye: { tone: "warn", label: "En attente" },
  en_retard: { tone: "danger", label: "En retard" },
  paye: { tone: "ok", label: "Payée" },
  // Non atteignables pour une facture (présents pour l'exhaustivité du type).
  accepte: { tone: "ok", label: "Accepté" },
  refuse: { tone: "danger", label: "Refusé" },
};

const DEVIS_META: Record<DocumentStatus, StatusMeta> = {
  brouillon: { tone: "neutral", label: "Brouillon" },
  envoye: { tone: "accent", label: "Envoyé" },
  accepte: { tone: "ok", label: "Accepté" },
  refuse: { tone: "danger", label: "Refusé" },
  // Non atteignables pour un devis.
  en_retard: { tone: "danger", label: "En retard" },
  paye: { tone: "ok", label: "Payé" },
};

export function statusMeta(type: DocType, status: DocumentStatus): StatusMeta {
  return type === "facture" ? FACTURE_META[status] : DEVIS_META[status];
}
