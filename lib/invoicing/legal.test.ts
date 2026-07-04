import { describe, test, expect } from "bun:test";
import {
  legalMentions,
  legalMentionsText,
  LEGAL_FRANCHISE_TVA,
  LEGAL_PENALTIES,
  LEGAL_TVA_ENCAISSEMENTS,
  LEGAL_DEVIS_VALIDITY,
} from "./legal";

describe("legalMentions — mentions selon type et régime", () => {
  test("facture au réel : pénalités + TVA sur encaissements (texte exact maquette)", () => {
    const mentions = legalMentions({ type: "facture", regime: "reel" });
    expect(mentions).toEqual([LEGAL_PENALTIES, LEGAL_TVA_ENCAISSEMENTS]);
    // Reproduit EXACTEMENT la chaîne .doc-legal de Document.html.
    expect(legalMentionsText({ type: "facture", regime: "reel" })).toBe(
      "En cas de retard de paiement, pénalités calculées à trois fois le taux d’intérêt légal et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce). Pas d’escompte pour règlement anticipé. TVA sur les encaissements.",
    );
  });

  test("réel normal : même traitement que le réel simplifié", () => {
    expect(legalMentions({ type: "facture", regime: "normal" })).toEqual([
      LEGAL_PENALTIES,
      LEGAL_TVA_ENCAISSEMENTS,
    ]);
  });

  test("facture en franchise : mention 293 B du CGI, pas d'encaissements", () => {
    const mentions = legalMentions({ type: "facture", regime: "franchise" });
    expect(mentions).toContain(LEGAL_FRANCHISE_TVA);
    expect(mentions).not.toContain(LEGAL_TVA_ENCAISSEMENTS);
    // La mention légale de franchise est obligatoire.
    expect(LEGAL_FRANCHISE_TVA).toBe("TVA non applicable, art. 293 B du CGI");
    // Les pénalités de retard restent dues (B2B, art. L441-10).
    expect(mentions).toContain(LEGAL_PENALTIES);
  });

  test("devis : clause de validité 30 jours (texte exact maquette)", () => {
    expect(legalMentions({ type: "devis", regime: "reel" })).toEqual([
      LEGAL_DEVIS_VALIDITY,
    ]);
    expect(LEGAL_DEVIS_VALIDITY).toBe(
      "Devis valable 30 jours à compter de sa date d’émission. Toute acceptation vaut bon pour accord et engagement de paiement selon les conditions indiquées.",
    );
  });

  test("devis en franchise : validité + mention 293 B", () => {
    expect(legalMentions({ type: "devis", regime: "franchise" })).toEqual([
      LEGAL_DEVIS_VALIDITY,
      LEGAL_FRANCHISE_TVA,
    ]);
  });
});
