import type { ProfileData } from "@/app/(app)/parametres/actions";
import { CARD, CARD_BODY, CARD_HEAD, CARD_TITLE, INPUT, LABEL, NOTE } from "./shared";

// Section « Préférences de facturation » — LECTURE SEULE : le format de
// numérotation n'est pas modélisé comme éditable (fixe, imposé par la loi),
// et « Conditions de paiement par défaut » n'est pas modélisé du tout (hors
// scope #12). Aucun bouton Enregistrer : rien n'est réellement modifiable ici.
export function BillingPrefsCard({ profile }: { profile: ProfileData }) {
  return (
    <section className={CARD} id="facturation">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Préférences de facturation</h2>
      </div>
      <div className={CARD_BODY}>
        <label htmlFor="numbering" className={LABEL}>
          Format de numérotation
        </label>
        <input
          id="numbering"
          type="text"
          readOnly
          disabled
          title="Format fixe, imposé par la numérotation continue — non modifiable"
          value="FAC-{ANNÉE}-{N°}"
          className={`${INPUT} font-mono text-[13px]`}
        />
        <div className={NOTE}>
          Prochaine pièce : <b className="font-semibold text-ink-2">{profile.nextDocumentNumber}</b>.
          Numérotation continue, sans trou — exigée par l&apos;administration.
        </div>
      </div>
    </section>
  );
}
