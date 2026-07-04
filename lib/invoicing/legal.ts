// Mentions légales auto-injectées sur les documents.
//
// TEXTES EXACTS repris des maquettes de référence :
//  - Franchise en base : « TVA non applicable, art. 293 B du CGI »
//    (cf. Profil.html + README §9/§15).
//  - Facture au réel : pénalités de retard + indemnité 40 € (art. L441-10) +
//    « TVA sur les encaissements » (cf. Document.html ligne 329 /
//    « Nouvelle facture.html » ligne 344).
//  - Devis : clause de validité 30 jours (cf. Document.html ligne 304).
//
// Note d'incohérence maquettes : « Nouvelle facture.html » utilise l'apostrophe
// droite (U+0027), « Document.html » l'apostrophe typographique (U+2019). Le
// document RENDU (Document.html, source du PDF) fait foi : on retient U+2019,
// cohérent avec la typographie française. Signalé au parent.

import type { DocType, TvaRegime } from "./types";

// Fragment franchise en base (art. 293 B du CGI).
export const LEGAL_FRANCHISE_TVA = "TVA non applicable, art. 293 B du CGI";

// Fragment pénalités de retard + indemnité forfaitaire (art. L441-10).
export const LEGAL_PENALTIES =
  "En cas de retard de paiement, pénalités calculées à trois fois le taux d’intérêt légal et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce). Pas d’escompte pour règlement anticipé.";

// Fragment régime réel : TVA exigible sur les encaissements.
export const LEGAL_TVA_ENCAISSEMENTS = "TVA sur les encaissements.";

// Fragment validité d'un devis.
export const LEGAL_DEVIS_VALIDITY =
  "Devis valable 30 jours à compter de sa date d’émission. Toute acceptation vaut bon pour accord et engagement de paiement selon les conditions indiquées.";

// Renvoie la liste ordonnée des mentions à afficher au pied du document.
//
// Facture réel/normal : [PENALTIES, TVA_ENCAISSEMENTS] — joint par un espace,
// reproduit EXACTEMENT la chaîne de Document.html.
// Facture franchise : [PENALTIES, FRANCHISE_TVA] (pas de TVA sur encaissements).
// Devis : [VALIDITY] (+ FRANCHISE_TVA en franchise).
export function legalMentions(params: {
  type: DocType;
  regime: TvaRegime;
}): string[] {
  const { type, regime } = params;

  if (type === "devis") {
    const out = [LEGAL_DEVIS_VALIDITY];
    if (regime === "franchise") out.push(LEGAL_FRANCHISE_TVA);
    return out;
  }

  // Facture
  const out = [LEGAL_PENALTIES];
  out.push(regime === "franchise" ? LEGAL_FRANCHISE_TVA : LEGAL_TVA_ENCAISSEMENTS);
  return out;
}

// Version en un seul paragraphe (comme le bloc .doc-legal des maquettes).
export function legalMentionsText(params: {
  type: DocType;
  regime: TvaRegime;
}): string {
  return legalMentions(params).join(" ");
}
