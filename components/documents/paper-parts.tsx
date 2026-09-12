import { formatSiret } from "@/components/clients/format";

// Morceaux du papier A4 partagés entre l'aperçu de l'éditeur (client) et le
// document émis (serveur) — issue #105. Avant, l'aperçu portait ses propres
// textes codés en dur (« SIRET à compléter »…) datant d'avant les Paramètres
// (#12) et divergeait du document réel. Sans hook ni "use client" : importable
// des deux côtés. Couleurs figées en oklch (papier blanc dans les deux thèmes,
// exception assumée).

export type PaperEmitter = {
  name: string | null;
  address: string | null;
  siret: string | null;
  iban: string | null;
  bic: string | null;
  logoUrl: string | null; // URL signée du logo (#87), null sans logo
};

// Petit label du document A4 (reproduit `.doc-meta label` / `.doc-client label`).
export function DocLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.09em] text-[oklch(0.55_0.01_75)]">
      {children}
    </label>
  );
}

// En-tête émetteur : logo optionnel, nom, adresse, SIRET. Un placeholder ne
// s'affiche QUE si le champ est réellement vide dans le profil.
export function PaperEmitterBlock({ emitter }: { emitter: PaperEmitter }) {
  return (
    <div className="text-[oklch(0.42_0.012_75)]">
      {emitter.logoUrl ? (
        // URL signée Supabase à durée limitée : next/image n'apporte rien (pas
        // d'optimisation possible sur une URL expirante) et le PDF Puppeteer
        // charge l'octet exact. Dimensions bornées, jamais déformé.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={emitter.logoUrl}
          alt=""
          className="mb-[10px] block max-h-[52px] max-w-[180px] object-contain object-left"
        />
      ) : null}
      <b className="mb-[3px] block text-[14px]">
        {emitter.name ?? (
          <span className="italic">Nom à compléter dans Paramètres</span>
        )}
      </b>
      {emitter.address ? (
        <span className="whitespace-pre-line">{emitter.address}</span>
      ) : (
        <span className="italic">Adresse à compléter dans Paramètres</span>
      )}
      <br />
      <span className="font-mono text-[10px]">
        {emitter.siret
          ? `SIRET ${formatSiret(emitter.siret)}`
          : "SIRET à compléter dans Paramètres"}
      </span>
    </div>
  );
}

// Bloc « Règlement par virement » du pied de page.
export function PaperPaymentBlock({ emitter }: { emitter: PaperEmitter }) {
  return (
    <div>
      <DocLabel>Règlement par virement</DocLabel>
      <span className="font-mono text-[10px]">
        {emitter.iban
          ? `IBAN ${emitter.iban}${emitter.bic ? ` · BIC ${emitter.bic}` : ""}`
          : "IBAN à compléter dans Paramètres"}
      </span>
    </div>
  );
}
