"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Copy,
  Download,
  FileText,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tag } from "@/components/dashboard/tag";
import { GatedCreateLink } from "@/components/paywall/gated-create-link";
import { PaywallModal } from "@/components/paywall/paywall-modal";
import { cn } from "@/lib/utils";
import { formatEuros, type DocType } from "@/lib/invoicing";
import { nextMonthFirstLabel } from "@/lib/date-fr";
import {
  duplicateDocument,
  type DocumentListItem,
  type DocumentStatus,
  type InvoiceSummary,
  type QuoteSummary,
} from "@/app/(app)/documents/actions";
import type { Usage } from "@/app/(app)/abonnement/actions";
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
  | {
      type: "facture";
      items: DocumentListItem[];
      summary: InvoiceSummary;
      usage: Usage;
    }
  | {
      type: "devis";
      items: DocumentListItem[];
      summary: QuoteSummary;
      usage: Usage;
    };

// Segment d'URL de la vue Document par type. DocType est "facture" (singulier,
// vocabulaire métier) alors que la route est `/factures/[id]` (pluriel) — sans
// cette table, `/${type}/${id}` produit `/facture/[id]` (404). Le devis ne
// l'a jamais révélé : "devis" est invariant en français (identique aux deux).
const LIST_PATH: Record<DocType, string> = { facture: "factures", devis: "devis" };

export function DocumentList(props: Props) {
  const { type, items, usage } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterId>("all");

  // Dupliquer (#66) : crée un brouillon identique puis ouvre l'éditeur dessus.
  // `duplicatingId` désactive les boutons pendant l'action (anti double-clic).
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  async function handleDuplicate(id: string) {
    setDuplicatingId(id);
    setDuplicateError(null);
    const res = await duplicateDocument(id);
    if ("error" in res) {
      setDuplicatingId(null);
      setDuplicateError(res.error);
      return;
    }
    router.push(`/documents/nouveau?document=${res.id}`);
  }

  // Modale paywall (issue #10) : partagée par les 2 boutons de création de
  // cette page ET par l'accès direct à l'URL de l'éditeur (redirigé ici avec
  // `?limite=1` par app/(app)/documents/nouveau/page.tsx).
  const [paywallOpen, setPaywallOpen] = useState(false);
  const paywallTriggerRef = useRef<HTMLAnchorElement | null>(null);
  const limitReached =
    usage.planType === "free" &&
    usage.documentsLimit !== null &&
    usage.documentsThisMonth >= usage.documentsLimit;

  useEffect(() => {
    if (searchParams.get("limite") === "1") {
      setPaywallOpen(true);
    }
    // Ouverture une seule fois au montage : searchParams volontairement
    // absent des dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPaywall(trigger: HTMLAnchorElement) {
    paywallTriggerRef.current = trigger;
    setPaywallOpen(true);
  }
  function closePaywall() {
    setPaywallOpen(false);
    paywallTriggerRef.current?.focus();
  }

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
          <GatedCreateLink
            usage={usage}
            href={createHref}
            onBlocked={openPaywall}
            className={cn(buttonVariants({ variant: "primary" }))}
          >
            <Plus strokeWidth={2} />
            {copy.createLabel}
          </GatedCreateLink>
        </div>
      </div>

      {/* Bannière limite atteinte (`.limit-banner`, AC #3) — visible dès 5/5,
          quel que soit le nombre de documents de CE type précis (le quota
          porte sur devis + factures confondus). */}
      {limitReached && (
        <div className="mb-gap flex items-center gap-[13px] rounded-md bg-warn-soft px-[18px] py-[13px] text-[13.5px] leading-[1.55] text-warn-ink">
          <TriangleAlert
            className="h-[18px] w-[18px] flex-none"
            strokeWidth={2.2}
            aria-hidden
          />
          <div>
            Vous avez émis{" "}
            <b className="font-bold">
              {usage.documentsThisMonth} documents sur {usage.documentsLimit}
            </b>{" "}
            ce mois-ci. La création est bloquée jusqu&apos;au{" "}
            <b className="font-bold">{nextMonthFirstLabel()}</b> sur le
            forfait Gratuit.
          </div>
          <Link
            href="/abonnement"
            className={cn(
              buttonVariants({ variant: "primary", size: "sm" }),
              "ml-auto flex-none",
            )}
          >
            Passer en Premium
          </Link>
        </div>
      )}

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
          <GatedCreateLink
            usage={usage}
            href={createHref}
            onBlocked={openPaywall}
            className={cn(buttonVariants({ variant: "primary" }), "mt-5")}
          >
            <Plus strokeWidth={2} />
            {copy.createLabel}
          </GatedCreateLink>
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
          {duplicateError && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
            >
              {duplicateError}
            </p>
          )}

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
                  <th className={cn(th, "w-[218px]")} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {filtered.map((d) => {
                  const meta = statusMeta(type, d.status);
                  const late = d.status === "en_retard";
                  return (
                    <tr
                      key={d.id}
                      onClick={() => router.push(`/${LIST_PATH[type]}/${d.id}`)}
                      className="cursor-pointer transition-colors hover:bg-surface-2"
                    >
                      <td className={td}>
                        <Link
                          href={`/${LIST_PATH[type]}/${d.id}`}
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
                        <div className="flex justify-end gap-1.5">
                          {/* Dupliquer (#66) : nouveau brouillon identique,
                              ouvert dans l'éditeur. */}
                          <button
                            type="button"
                            title={`Dupliquer ${d.number ?? "ce brouillon"}`}
                            aria-label={`Dupliquer ${d.number ?? "ce brouillon"}`}
                            disabled={duplicatingId !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(d.id);
                            }}
                            className="inline-flex h-[30px] items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-50"
                          >
                            <Copy
                              className="h-3.5 w-3.5"
                              strokeWidth={2}
                              aria-hidden
                            />
                            {duplicatingId === d.id ? "…" : "Dupliquer"}
                          </button>
                          {d.number === null ? (
                            <button
                              type="button"
                              disabled
                              title="Émettez le document pour télécharger le PDF"
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
                          ) : (
                            <a
                              href={`/api/documents/${d.id}/pdf`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex h-[30px] items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2"
                            >
                              <Download
                                className="h-3.5 w-3.5"
                                strokeWidth={2}
                                aria-hidden
                              />
                              PDF
                            </a>
                          )}
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

      <PaywallModal open={paywallOpen} onClose={closePaywall} usage={usage} />
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
