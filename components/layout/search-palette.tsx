"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, Search, Users } from "lucide-react";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";
import { searchAll, type SearchResults } from "@/app/(app)/search";

// Recherche globale ⌘K (issue #63) — remplace le champ décoratif de la topbar.
// Déclencheur visuellement identique à la maquette (faux champ + kbd ⌘K) qui
// ouvre une palette (ModalShell) : saisie débouncée → server action searchAll
// (filtrée userId côté serveur) → résultats groupés Clients/Projets/Documents.
//
// A11Y (combobox) : input role="combobox" + aria-expanded/-controls/
// -activedescendant, résultats en role="listbox"/"option", navigation ↑ ↓ ↵,
// Échap et focus trap fournis par ModalShell.

const EMPTY: SearchResults = { clients: [], projects: [], documents: [] };
const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

// Élément « plat » de la liste (pour la navigation clavier trans-groupes).
type FlatItem = {
  key: string;
  href: string;
  icon: typeof Users;
  primary: string;
  secondary: string;
};

function flatten(results: SearchResults): FlatItem[] {
  return [
    ...results.clients.map((c) => ({
      key: `client-${c.id}`,
      href: `/clients/${c.id}`,
      icon: Users,
      primary: c.name,
      secondary: "Client",
    })),
    ...results.projects.map((p) => ({
      key: `project-${p.id}`,
      href: `/projets/${p.id}`,
      icon: FolderKanban,
      primary: p.name,
      secondary: `Projet · ${p.clientName}`,
    })),
    ...results.documents.map((d) => ({
      key: `document-${d.id}`,
      href: d.type === "facture" ? `/factures/${d.id}` : `/devis/${d.id}`,
      icon: FileText,
      primary: d.number,
      secondary: `${d.type === "facture" ? "Facture" : "Devis"} · ${d.clientName}`,
    })),
  ];
}

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  // N° de requête : une réponse périmée (frappe rapide) est ignorée.
  const seqRef = useRef(0);

  const items = useMemo(() => flatten(results), [results]);
  const ready = query.trim().length >= MIN_CHARS;

  // Raccourci global ⌘K (macOS) / Ctrl+K.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Recherche débouncée — jamais sous MIN_CHARS (requêtes trop larges).
  useEffect(() => {
    if (!open) return;
    if (!ready) {
      setResults(EMPTY);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await searchAll(query);
        if (seqRef.current === seq) {
          setResults(res);
          setActiveIndex(0);
        }
      } finally {
        if (seqRef.current === seq) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, ready]);

  function openPalette() {
    setQuery("");
    setResults(EMPTY);
    setActiveIndex(0);
    setOpen(true);
  }

  function go(item: FlatItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) go(item);
    }
  }

  // Groupes rendus dans l'ordre du flat (les index globaux suivent).
  const groups: { label: string; items: FlatItem[]; offset: number }[] = [];
  {
    let offset = 0;
    for (const [label, list] of [
      ["Clients", results.clients],
      ["Projets", results.projects],
      ["Documents", results.documents],
    ] as const) {
      if (list.length > 0) {
        groups.push({ label, items: items.slice(offset, offset + list.length), offset });
        offset += list.length;
      }
    }
  }

  return (
    <>
      {/* Déclencheur — reprend le style du champ de la maquette. */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Rechercher (raccourci Cmd+K ou Ctrl+K)"
        className="ml-auto flex h-11 w-11 items-center justify-center gap-[9px] rounded-md border border-line bg-surface text-ink-3 transition-shadow hover:border-accent focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft sm:h-auto sm:w-[280px] sm:justify-start sm:px-[13px] sm:py-2"
      >
        <Search className="h-4 w-4 flex-none" strokeWidth={2} aria-hidden />
        {/* Libellé et raccourci masqués sur mobile (#96) : déclencheur icône
            seule, l'aria-label porte le nom accessible dans tous les cas. */}
        <span className="hidden truncate text-sm sm:inline">
          Rechercher un client, une facture…
        </span>
        <span className="num ml-auto hidden rounded-[5px] border border-line px-[5px] py-px text-[11px] sm:inline">
          ⌘K
        </span>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title="Recherche"
        titleId="search-palette-title"
        initialFocusRef={inputRef}
      >
        <div className="px-6 py-5">
          <div className="flex items-center gap-[9px] rounded-md border border-line bg-surface px-[13px] py-2 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent-soft">
            <Search className="h-4 w-4 flex-none text-ink-3" strokeWidth={2} aria-hidden />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls="search-palette-listbox"
              aria-activedescendant={
                items[activeIndex] ? `search-opt-${items[activeIndex].key}` : undefined
              }
              aria-label="Rechercher un client, un projet ou un document"
              placeholder="Nom de client, titre de projet, n° de document…"
              autoComplete="off"
              spellCheck={false}
              className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
            />
          </div>

          {/* Résultats */}
          <div className="mt-3 max-h-[46vh] overflow-y-auto" aria-live="polite">
            {!ready ? (
              <p className="px-1 py-3 text-[13px] text-ink-3">
                Tapez au moins {MIN_CHARS} caractères pour lancer la recherche.
              </p>
            ) : searching && items.length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-ink-3">Recherche…</p>
            ) : items.length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-ink-3">
                Aucun résultat pour «&nbsp;{query.trim()}&nbsp;».
              </p>
            ) : (
              <ul id="search-palette-listbox" role="listbox" aria-label="Résultats">
                {groups.map((group) => (
                  <li key={group.label} role="presentation">
                    <div
                      role="presentation"
                      className="px-1 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3 first:pt-1"
                    >
                      {group.label}
                    </div>
                    <ul role="presentation">
                      {group.items.map((item, i) => {
                        const index = group.offset + i;
                        const Icon = item.icon;
                        const active = index === activeIndex;
                        return (
                          <li
                            key={item.key}
                            id={`search-opt-${item.key}`}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => go(item)}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                              active ? "bg-accent-soft" : "hover:bg-surface-2",
                            )}
                          >
                            <span
                              className={cn(
                                "grid h-8 w-8 flex-none place-items-center rounded-md",
                                active
                                  ? "bg-surface text-accent-ink"
                                  : "bg-surface-2 text-ink-2",
                              )}
                            >
                              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-sm font-semibold",
                                  active && "text-accent-ink",
                                )}
                              >
                                {item.primary}
                              </span>
                              <span className="block truncate text-[12.5px] text-ink-3">
                                {item.secondary}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] text-ink-3">
            <span className="num rounded-[4px] border border-line px-1 py-px">↑↓</span>{" "}
            naviguer ·{" "}
            <span className="num rounded-[4px] border border-line px-1 py-px">↵</span>{" "}
            ouvrir ·{" "}
            <span className="num rounded-[4px] border border-line px-1 py-px">Échap</span>{" "}
            fermer
          </p>
        </div>
      </ModalShell>
    </>
  );
}
