"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Download, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { cn } from "@/lib/utils";
import { formatEuros, type DocType } from "@/lib/invoicing";
import type {
  DocumentListItem,
  DocumentStatus,
  InvoiceSummary,
  QuoteSummary,
} from "@/app/(app)/documents/actions";
import { statusMeta } from "./status";
import { formatListDate } from "./format";

// Filtre appliqué à la liste : « all » ou un statut effectif précis.
type FilterId = "all" | DocumentStatus;

// Libellés dépendant du type de document (colonnes, titres, textes).
const COPY: Record<
  DocType,
  {
    title: string;
    dateHeader: string; // colonne « Émise le » / « Envoyé »
    dueHeader: string; // colonne « Échéance » / « Validité »
    clientLabel: string; // « Facturé à » n'est pas ici mais sert au singulier
    word: string; // « facture » / « devis »
    wordPlural: string;
    createLabel: string;
    emptyTitle: string;
    emptyText: string;
  }
> = {
  facture: {
    title: "Factures",
    dateHeader: "Émise le",
    dueHeader: "Échéance",
    clientLabel: "Facturé à",
    word: "facture",
    wordPlural: "factures",
    createLabel: "Nouvelle facture",
    emptyTitle: "Aucune facture pour l'instant",
    emptyText:
      "Créez votre première facture : totaux et mentions légales sont calculés automatiquement.",
  },
  devis: {
    title: "Devis",
    dateHeader: "Envoyé",
    dueHeader: "Validité",
    clientLabel: "Adressé à",
    word: "devis",
    wordPlural: "devis",
    createLabel: "Nouveau devis",
    emptyTitle: "Aucun devis pour l'instant",
    emptyText:
      "Créez un devis pour chiffrer une mission ; vous pourrez le suivre jusqu'à son acceptation.",
  },
};

// Jeux de chips par type. Les identifiants pointent vers un statut effectif réel
// (pas de filtre « à relancer » : la relance n'est pas modélisée à ce stade).
const FILTERS: Record<DocType, { id: FilterId; label: string }[]> = {
  facture: [
    { id: "all", label: "Toutes" },
    { id: "paye", label: "Payées" },
    { id: "envoye", label: "En attente" },
    { id: "en_retard", label: "En retard" },
    { id: "brouillon", label: "Brouillons" },
  ],
  devis: [
    { id: "all", label: "Tous" },
    { id: "brouillon", label: "Brouillons" },
    { id: "envoye", label: "Envoyés" },
    { id: "accepte", label: "Acceptés" },
    { id: "refuse", label: "Refusés" },
  ],
};

type Props =
  | { type: "facture"; items: DocumentListItem[]; summary: InvoiceSummary }
  | { type: "devis"; items: DocumentListItem[]; summary: QuoteSummary };

export function DocumentList(props: Props) {
  const { type, items } = props;
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");

  const copy = COPY[type];
  const createHref = `/documents/nouveau?type=${type}`;

  const countOf = (status: DocumentStatus) =>
    items.filter((d) => d.status === status).length;

  const filtered =
    filter === "all" ? items : items.filter((d) => d.status === filter);
  const filteredTotalCents = filtered.reduce(
    (sum, d) => sum + d.totalTtcCents,
    0,
  );

  // Dernière pièce émise (numéro attribué + date d'émission) pour la sous-ligne.
  const lastIssued = items
    .filter((d) => d.number !== null && d.issuedAt !== null)
    .reduce<Date | null>((latest, d) => {
      const at = d.issuedAt as Date;
      return latest === null || at.getTime() > latest.getTime() ? at : latest;
    }, null);

  const chipBase =
    "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors";
  const th =
    "border-b border-line-soft px-pad py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3";
  const td = "border-b border-line-soft px-pad py-3.5";

  return (
    <>
      {/* En-tête de page (`.page-head`) */}
      <div className="mb-[22px] flex items-center gap-[18px]">
        <div>
          <div className="text-2xl font-extrabold tracking-[-0.03em]">
            {copy.title}
          </div>
          <div className="mt-[3px] text-sm text-ink-3">
            {items.length} {items.length > 1 ? copy.wordPlural : copy.word}
            {lastIssued
              ? ` · dernière émise le ${formatListDate(lastIssued)}`
              : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {type === "facture" && (
            <Button
              type="button"
              variant="default"
              disabled
              title="Bientôt disponible"
            >
              <Download strokeWidth={2} />
              Exporter
            </Button>
          )}
          <Button asChild variant="primary">
            <Link href={createHref}>
              <Plus strokeWidth={2} />
              {copy.createLabel}
            </Link>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        // État vide engageant
        <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface px-6 py-16 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <FileText className="h-6 w-6" strokeWidth={2} aria-hidden />
          </div>
          <h2 className="mt-4 text-lg font-bold tracking-[-0.02em]">
            {copy.emptyTitle}
          </h2>
          <p className="mt-1.5 max-w-[380px] text-sm text-ink-3">
            {copy.emptyText}
          </p>
          <Button asChild variant="primary" className="mt-5">
            <Link href={createHref}>
              <Plus strokeWidth={2} />
              {copy.createLabel}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Bandeau de synthèse (`.sums`) */}
          <div className="mb-gap grid grid-cols-3 gap-gap max-[1100px]:grid-cols-1">
            {props.type === "facture" ? (
              <>
                <SummaryTile
                  dot="bg-ok"
                  label="Encaissé"
                  value={formatEuros(props.summary.paidCents)}
                  note={`${countOf("paye")} facture${countOf("paye") > 1 ? "s" : ""}`}
                />
                <SummaryTile
                  dot="bg-warn"
                  label="En attente de paiement"
                  value={formatEuros(props.summary.pendingCents)}
                  note={`${countOf("envoye")} facture${countOf("envoye") > 1 ? "s" : ""}`}
                />
                <SummaryTile
                  dot="bg-danger"
                  label="En retard"
                  value={formatEuros(props.summary.overdueCents)}
                  note={`${countOf("en_retard")} facture${countOf("en_retard") > 1 ? "s" : ""}`}
                />
              </>
            ) : (
              <>
                <SummaryTile
                  dot="bg-warn"
                  label="En attente de réponse"
                  value={formatEuros(props.summary.pendingCents)}
                  note={`${countOf("envoye")} devis`}
                />
                <SummaryTile
                  dot="bg-ok"
                  label="Acceptés"
                  value={formatEuros(props.summary.acceptedCents)}
                  note={`${countOf("accepte")} devis`}
                />
                <SummaryTile
                  dot="bg-accent"
                  label="Taux d'acceptation"
                  value={`${props.summary.acceptanceRate} %`}
                  note="devis tranchés"
                />
              </>
            )}
          </div>

          {/* Filtres (`.filters`) */}
          <div className="mb-4 flex items-center gap-2.5">
            {FILTERS[type].map((c) => {
              const n = c.id === "all" ? items.length : countOf(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  aria-pressed={filter === c.id}
                  className={cn(
                    chipBase,
                    filter === c.id
                      ? "border-ink bg-ink text-bg"
                      : "border-line bg-surface text-ink-2 hover:bg-surface-2",
                  )}
                >
                  {c.label}{" "}
                  <span className="num text-[11.5px] opacity-70">{n}</span>
                </button>
              );
            })}
            {/* Sélecteur d'année : décoratif (aucune spec de comportement). */}
            <span
              className={cn(
                chipBase,
                "ml-auto border-line bg-surface text-ink-2",
              )}
            >
              <Calendar className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {new Date().getFullYear()}
            </span>
          </div>

          {/* Tableau (`.card` + `.tbl`) */}
          <section className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Pièce</th>
                  <th className={th}>Client</th>
                  <th className={cn(th, "max-[1100px]:hidden")}>Objet</th>
                  <th className={th}>{copy.dateHeader}</th>
                  <th className={th}>{copy.dueHeader}</th>
                  <th className={th}>Statut</th>
                  <th className={cn(th, "text-right")}>Montant TTC</th>
                  <th className={cn(th, "w-[130px]")} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {filtered.map((d) => {
                  const meta = statusMeta(type, d.status);
                  const late = d.status === "en_retard";
                  return (
                    <tr
                      key={d.id}
                      onClick={() => router.push(`/${type}/${d.id}`)}
                      className="cursor-pointer transition-colors hover:bg-surface-2"
                    >
                      <td className={td}>
                        <Link
                          href={`/${type}/${d.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="num whitespace-nowrap text-[13px] font-medium text-ink-2 outline-none hover:text-accent-ink focus-visible:text-accent-ink focus-visible:underline"
                        >
                          {d.number ?? (
                            <span className="italic text-ink-3">Brouillon</span>
                          )}
                        </Link>
                      </td>
                      <td className={cn(td, "text-[14px] font-[600]")}>
                        {d.clientName}
                      </td>
                      <td
                        className={cn(
                          td,
                          "max-w-[260px] truncate text-ink-3 max-[1100px]:hidden",
                        )}
                      >
                        {d.object ?? "—"}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-ink-3")}>
                        {formatListDate(d.issuedAt)}
                      </td>
                      <td
                        className={cn(
                          td,
                          "whitespace-nowrap",
                          late
                            ? "font-semibold text-danger"
                            : "text-ink-3",
                        )}
                      >
                        {formatListDate(d.dueAt)}
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      <td
                        className={cn(
                          td,
                          "num whitespace-nowrap text-right font-semibold",
                        )}
                      >
                        {formatEuros(d.totalTtcCents)}
                      </td>
                      <td className={td}>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled
                            title="Bientôt disponible (#9)"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 text-[12.5px] font-semibold text-ink-2 disabled:opacity-50"
                          >
                            <Download
                              className="h-3.5 w-3.5"
                              strokeWidth={2}
                              aria-hidden
                            />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center gap-3 px-pad py-3.5 text-[13px] text-ink-3">
              <span>
                {filtered.length}{" "}
                {filtered.length > 1 ? copy.wordPlural : copy.word} · total :{" "}
                <b className="num text-ink">{formatEuros(filteredTotalCents)}</b>{" "}
                TTC
              </span>
            </div>
          </section>
        </>
      )}
    </>
  );
}

// Tuile de synthèse (`.sum`).
function SummaryTile({
  dot,
  label,
  value,
  note,
}: {
  dot: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-line bg-surface px-5 py-4 shadow-sm">
      <span className={cn("h-2.5 w-2.5 flex-none rounded-full", dot)} />
      <div>
        <div className="text-[13px] font-semibold text-ink-2">{label}</div>
        <div className="num text-[19px] font-semibold tracking-[-0.01em]">
          {value}
        </div>
      </div>
      <span className="ml-auto text-[12.5px] text-ink-3">{note}</span>
    </div>
  );
}
