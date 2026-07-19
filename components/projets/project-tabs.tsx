"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/dashboard/tag";
import { statusMeta } from "@/components/documents/status";
import { formatListDate } from "@/components/documents/format";
import { formatEuros } from "@/lib/invoicing";
import type { ProjectDocumentRow } from "@/app/(app)/projets/actions";

type TabId = "documents" | "notes" | "activite";

// Onglets de la fiche projet (Documents / Notes / Activité). Aucune spec d'onglets
// dans la maquette (qui présentait phases + pièces + activité en cartes) : design
// d'onglets accessible interprété (tablist/tab/tabpanel), tokens uniquement.
//
// Documents : devis + factures rattachés au projet (issue #86). Notes : champ
// réel du projet. Activité : placeholder (journal non modélisé).
export function ProjectTabs({
  notes,
  documents,
}: {
  notes: string | null;
  documents: ProjectDocumentRow[];
}) {
  const [tab, setTab] = useState<TabId>("documents");

  const tabs = [
    { id: "documents" as const, label: "Documents", icon: FileText },
    { id: "notes" as const, label: "Notes", icon: StickyNote },
    { id: "activite" as const, label: "Activité", icon: Activity },
  ];

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      {/* Barre d'onglets */}
      <div
        role="tablist"
        aria-label="Contenu du projet"
        className="flex items-center gap-1 border-b border-line-soft px-2.5"
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3.5 text-[13.5px] font-semibold transition-colors",
                active
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-3 hover:text-ink-2",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Documents — devis + factures rattachés (issue #86) */}
      {tab === "documents" && (
        <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
          {documents.length === 0 ? (
            <div className="px-pad py-12 text-center">
              <p className="text-sm font-semibold text-ink-2">Aucun document</p>
              <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-ink-3">
                Les devis et factures rattachés à ce projet apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="[&>li:last-child]:border-b-0">
              {documents.map((d) => {
                const meta = statusMeta(d.type, d.status);
                const path = d.type === "facture" ? "factures" : "devis";
                return (
                  <li key={d.id} className="border-b border-line-soft">
                    <Link
                      href={`/${path}/${d.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-pad py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="num w-[130px] flex-none truncate text-[13px] font-medium text-ink-2">
                        {d.number ?? (
                          <span className="italic text-ink-3">Brouillon</span>
                        )}
                      </span>
                      <Tag tone={meta.tone}>{meta.label}</Tag>
                      <span className="ml-auto whitespace-nowrap text-[12.5px] text-ink-3">
                        {formatListDate(d.issuedAt)}
                      </span>
                      <span className="num w-[110px] flex-none text-right text-sm font-semibold">
                        {formatEuros(d.totalTtcCents)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Notes — champ réel ou état vide */}
      {tab === "notes" && (
        <div
          role="tabpanel"
          id="panel-notes"
          aria-labelledby="tab-notes"
          className="p-pad"
        >
          {notes ? (
            <p className="whitespace-pre-wrap text-sm leading-[1.65] text-ink-2">
              {notes}
            </p>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-ink-2">Aucune note</p>
              <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-ink-3">
                Aucune description n&apos;a été renseignée pour ce projet.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Activité — placeholder (journal non modélisé) */}
      {tab === "activite" && (
        <div
          role="tabpanel"
          id="panel-activite"
          aria-labelledby="tab-activite"
          className="px-pad py-12 text-center"
        >
          <p className="text-sm font-semibold text-ink-2">Rien à afficher</p>
          <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-ink-3">
            Le journal d&apos;activité (émission de pièces, paiements, jalons)
            arrivera avec la facturation.
          </p>
        </div>
      )}
    </section>
  );
}
