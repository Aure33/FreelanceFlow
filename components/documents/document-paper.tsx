import { formatSiret } from "@/components/clients/format";
import { formatEuros } from "@/lib/invoicing";
import type { DocumentView } from "@/app/(app)/documents/actions";
import { formatDocDate, formatQty, formatRate } from "./format";

// Document A4 en lecture — reprend EXACTEMENT le rendu de l'aperçu de l'éditeur
// (components/document-editor.tsx) : papier blanc fixe dans les deux thèmes
// (exception assumée), couleurs figées en oklch. Server component : aucun état.
//
// Émetteur = profil utilisateur ; tant que l'écran Paramètres (#12) n'existe pas,
// les champs non renseignés affichent un placeholder « à compléter ».
export function DocumentPaper({ view }: { view: DocumentView }) {
  const isFacture = view.type === "facture";
  const kind = isFacture ? "FACTURE" : "DEVIS";
  const dueLabel = isFacture ? "Échéance" : "Validité";
  const clientLabel = isFacture ? "Facturé à" : "Adressé à";
  const ref = view.number ?? "Brouillon";

  const iban = view.emitter.iban;
  const bic = view.emitter.bic;

  return (
    <div className="flex justify-center rounded-lg border border-line bg-[oklch(0.93_0.008_95)] p-[34px] max-[1180px]:p-[18px] print:justify-normal print:rounded-none print:border-none print:bg-white print:p-0">
      <div className="flex h-fit w-[595px] min-h-[842px] max-w-full flex-none flex-col rounded-[4px] bg-white p-[48px_52px] text-[11.5px] leading-[1.5] text-[oklch(0.25_0.01_75)] shadow-lg print:shadow-none">
        {/* En-tête : émetteur (logo #87 optionnel) + badge */}
        <div className="mb-[38px] flex items-start justify-between">
          <div className="text-[oklch(0.42_0.012_75)]">
            {view.emitter.logoUrl ? (
              // URL signée Supabase à durée limitée : next/image n'apporte
              // rien (pas d'optimisation possible sur une URL expirante) et le
              // PDF Puppeteer charge l'octet exact. Dimensions bornées, jamais
              // déformé (object-contain), fallback = en-tête texte inchangé.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.emitter.logoUrl}
                alt=""
                className="mb-[10px] block max-h-[52px] max-w-[180px] object-contain object-left"
              />
            ) : null}
            <b className="mb-[3px] block text-[14px]">
              {view.emitter.name ?? (
                <span className="italic">Nom à compléter dans Paramètres</span>
              )}
            </b>
            {view.emitter.address ? (
              <span className="whitespace-pre-line">{view.emitter.address}</span>
            ) : (
              <span className="italic">Adresse à compléter dans Paramètres</span>
            )}
            <br />
            <span className="font-mono text-[10px]">
              {view.emitter.siret
                ? `SIRET ${formatSiret(view.emitter.siret)}`
                : "SIRET à compléter"}{" "}
              · TVA à compléter
            </span>
          </div>
          <div className="text-right">
            <div className="text-[21px] font-extrabold tracking-[-0.02em] text-[oklch(0.40_0.15_264)]">
              {kind}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[oklch(0.45_0.012_75)]">
              {ref}
            </div>
          </div>
        </div>

        {/* Méta */}
        <div className="mb-[30px] flex gap-9">
          <div>
            <DocLabel>Date d&apos;émission</DocLabel>
            <div className="font-mono font-semibold">
              {formatDocDate(view.issuedAt)}
            </div>
          </div>
          <div>
            <DocLabel>{dueLabel}</DocLabel>
            <div className="font-mono font-semibold">
              {formatDocDate(view.dueAt)}
            </div>
          </div>
          <div>
            <DocLabel>Objet</DocLabel>
            <div className="font-semibold">{view.object ?? "—"}</div>
          </div>
        </div>

        {/* Client */}
        <div className="mb-[30px] rounded-[8px] bg-[oklch(0.975_0.005_95)] px-4 py-[13px]">
          <DocLabel>{clientLabel}</DocLabel>
          <b className="text-[13px]">{view.client.name}</b>
          {view.client.address && (
            <>
              <br />
              <span className="whitespace-pre-line">{view.client.address}</span>
            </>
          )}
          <br />
          <span className="font-mono text-[10px]">
            {view.client.siret
              ? `SIRET ${formatSiret(view.client.siret)}`
              : "SIRET non renseigné"}
          </span>
        </div>

        {/* Table des prestations */}
        <table className="mb-[22px] w-full border-collapse">
          <thead>
            <tr>
              <DocTh>Description</DocTh>
              <DocTh className="text-right">Qté</DocTh>
              <DocTh className="text-right">PU HT</DocTh>
              <DocTh className="text-right">TVA</DocTh>
              <DocTh className="text-right">Total HT</DocTh>
            </tr>
          </thead>
          <tbody>
            {view.lines.map((l) => (
              <tr key={l.id}>
                <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] align-top font-[550]">
                  {l.label}
                </td>
                <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                  {formatQty(l.quantity)}
                </td>
                <td className="whitespace-nowrap border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                  {formatEuros(l.unitPriceCents)}
                </td>
                <td className="border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                  {formatRate(l.tvaRate)}
                </td>
                <td className="whitespace-nowrap border-b border-[oklch(0.92_0.005_95)] px-2 py-[9px] text-right align-top font-mono text-[10.5px]">
                  {formatEuros(l.htCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totaux */}
        <div className="ml-auto w-[230px]">
          <div className="flex justify-between px-2 py-1">
            <span>Total HT</span>
            <span className="font-mono text-[10.5px]">
              {formatEuros(view.totalHtCents)}
            </span>
          </div>
          <div className="flex justify-between px-2 py-1">
            <span>TVA</span>
            <span className="font-mono text-[10.5px]">
              {formatEuros(view.totalTvaCents)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between rounded-[6px] bg-[oklch(0.95_0.035_264)] px-2.5 py-[9px]">
            <span className="font-bold">Total TTC</span>
            <span className="font-mono text-[13px] font-bold text-[oklch(0.40_0.15_264)]">
              {formatEuros(view.totalTtcCents)}
            </span>
          </div>
        </div>

        {/* Pied : règlement + mentions légales */}
        <div className="mt-auto pt-[28px]">
          <div className="flex gap-[30px] border-t border-[oklch(0.92_0.005_95)] py-[13px]">
            <div>
              <DocLabel>Règlement par virement</DocLabel>
              <span className="font-mono text-[10px]">
                {iban
                  ? `IBAN ${iban}${bic ? ` · BIC ${bic}` : ""}`
                  : "IBAN à compléter dans Paramètres"}
              </span>
            </div>
          </div>
          <div className="border-t border-[oklch(0.92_0.005_95)] pt-2.5 text-[8.5px] leading-[1.6] text-[oklch(0.55_0.01_75)]">
            {view.legalMentions.join(" ")}
          </div>
        </div>
      </div>
    </div>
  );
}

// Petit label du document A4 (reproduit `.doc-meta label` / `.doc-client label`).
function DocLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.09em] text-[oklch(0.55_0.01_75)]">
      {children}
    </label>
  );
}

// En-tête de colonne du tableau A4 (reproduit `.doc-tbl th`).
function DocTh({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b-[1.5px] border-[oklch(0.25_0.01_75)] px-2 pb-[7px] text-left text-[9px] font-bold uppercase tracking-[0.08em] text-[oklch(0.5_0.01_75)] ${className}`}
    >
      {children}
    </th>
  );
}
