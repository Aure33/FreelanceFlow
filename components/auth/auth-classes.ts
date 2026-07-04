// Classes partagées des écrans d'authentification (reproduisent `.input`,
// `.field label` et le bouton pleine largeur `.btn-block` des maquettes).

// Champ texte 44px, focus `border-accent` + anneau `accent-soft` (comme la maquette).
export const AUTH_INPUT =
  "h-[44px] w-full rounded-md border border-line bg-surface px-[14px] text-[14.5px] text-ink [transition:border-color_.12s,box-shadow_.12s] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none";

// Libellé de champ lié (13px, semi-gras, ink-2).
export const AUTH_LABEL = "mb-[6px] block text-[13px] font-semibold text-ink-2";

// Bouton pleine largeur (44px) réutilisé sous chaque formulaire.
export const AUTH_BLOCK_BTN =
  "mt-[6px] h-[44px] w-full justify-center text-[14.5px]";
