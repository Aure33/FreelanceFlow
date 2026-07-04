"use client";

import { useState } from "react";
import { Activity, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "documents" | "notes" | "activite";

// Onglets de la fiche projet (Documents / Notes / Activité). Aucune spec d'onglets
// dans la maquette (qui présentait phases + pièces + activité en cartes) : design
// d'onglets accessible interprété (tablist/tab/tabpanel), tokens uniquement.
//
// À ce stade : Documents et Activité sont des états vides (documents = #8) ; seul
// l'onglet Notes affiche une donnée réelle (le champ `notes` du projet).
export function ProjectTabs({ notes }: { notes: string | null }) {
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

      {/* Documents — état vide (à venir #8) */}
      {tab === "documents" && (
        <div
          role="tabpanel"
          id="panel-documents"
          aria-labelledby="tab-documents"
          className="px-pad py-12 text-center"
        >
          <p className="text-sm font-semibold text-ink-2">Aucun document</p>
          <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-ink-3">
            Les devis et factures rattachés à ce projet apparaîtront ici.
          </p>
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
