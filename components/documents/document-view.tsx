import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/dashboard/tag";
import { formatEuros } from "@/lib/invoicing";
import type { DocumentView as DocumentViewData } from "@/app/(app)/documents/actions";
import { DocumentPaper } from "./document-paper";
import { DocumentStatusActions } from "./document-status-actions";
import { ShareQuote } from "./share-quote";
import { SendEmail } from "./send-email";
import { statusMeta } from "./status";
import { formatDocDate } from "./format";

// Vue Document (server component) : fil d'Ariane + papier A4 (DocumentPaper) et
// panneau latéral (statut, infos, actions). Le panneau d'actions est le seul
// îlot client (transitions de statut). Le fil d'Ariane vit en tête de contenu
// (topbar applicative partagée, pilotée par la route).
export function DocumentView({ view }: { view: DocumentViewData }) {
  const isFacture = view.type === "facture";
  const listHref = isFacture ? "/factures" : "/devis";
  const listLabel = isFacture ? "Factures" : "Devis";
  const dueLabel = isFacture ? "Échéance" : "Validité";
  const ref = view.number ?? "Brouillon";
  const meta = statusMeta(view.type, view.status);

  const kvGrid =
    "grid grid-cols-[110px_1fr] gap-y-[10px] text-[13.5px] [&_dt]:text-ink-3 [&_dd]:font-[550]";

  return (
    <>
      {/* Fil d'Ariane (`.crumbs`) */}
      <nav
        aria-label="Fil d'Ariane"
        className="mb-[22px] flex items-center gap-2 text-sm print:hidden"
      >
        <Link
          href={listHref}
          className="font-medium text-ink-3 transition-colors hover:text-accent-ink"
        >
          {listLabel}
        </Link>
        <ChevronRight
          className="h-3.5 w-3.5 text-ink-3"
          strokeWidth={2}
          aria-hidden
        />
        <span
          className="num text-[13.5px] font-bold tracking-[-0.01em]"
          aria-current="page"
        >
          {ref}
        </span>
      </nav>

      <div className="grid grid-cols-[1fr_340px] items-start gap-gap max-[1180px]:grid-cols-1 print:block">
        {/* Document A4 */}
        <DocumentPaper view={view} />

        {/* Panneau latéral */}
        <aside className="sticky top-[calc(var(--topbar-h)_+_28px)] flex flex-col gap-gap max-[1180px]:static print:hidden">
          {/* Statut + infos */}
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="p-pad">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <b className="num block truncate text-[15px] font-bold">
                    {ref}
                  </b>
                  <small className="text-[12.5px] text-ink-3">
                    {view.client.name} ·{" "}
                    <span className="num">
                      {formatEuros(view.totalTtcCents)}
                    </span>{" "}
                    TTC
                  </small>
                </div>
                <Tag tone={meta.tone} className="ml-auto flex-none">
                  {meta.label}
                </Tag>
              </div>
              <hr className="my-4 border-none border-t border-line-soft" />
              <dl className={kvGrid}>
                <dt>Date d&apos;émission</dt>
                <dd className="num">{formatDocDate(view.issuedAt)}</dd>
                <dt>{dueLabel}</dt>
                <dd className="num">{formatDocDate(view.dueAt)}</dd>
                {view.paidAt && (
                  <>
                    <dt>Payée le</dt>
                    <dd className="num">{formatDocDate(view.paidAt)}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          {/* Actions */}
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="p-pad">
              <DocumentStatusActions
                type={view.type}
                id={view.id}
                status={view.status}
                sourceQuote={view.sourceQuote}
                convertedInvoice={view.convertedInvoice}
              />
            </div>
          </section>

          {/* Envoi par e-mail (#83) — tout document émis (devis ou facture) */}
          {view.status !== "brouillon" && (
            <SendEmail
              id={view.id}
              defaultEmail={view.client.email}
              lastSentAt={view.emailSentAt}
            />
          )}

          {/* Partage public (#85) — devis émis uniquement */}
          {view.type === "devis" && view.status !== "brouillon" && (
            <ShareQuote id={view.id} initialToken={view.publicToken} />
          )}

          {/* Rattachements */}
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Rattachements
              </h2>
            </div>
            <div className="p-pad">
              <dl className={kvGrid}>
                <dt>Client</dt>
                {/* Pas d'identifiant client dans la vue → lien impossible sans
                    élargir la server action ; on affiche le nom en clair. */}
                <dd>{view.client.name}</dd>
                <dt>Projet</dt>
                <dd>
                  <Link
                    href={`/projets/${view.project.id}`}
                    className="font-semibold text-accent-ink hover:underline"
                  >
                    {view.project.name}
                  </Link>
                </dd>
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
