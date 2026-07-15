"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Contrôle de pagination (issue #70) — piloté par l'URL (`?page=`). Rend de
// VRAIS liens (prefetchables, fonctionnels sans JS) en préservant les autres
// paramètres (statut, tri, vue). A11y : <nav aria-label>, page courante
// aria-current, bornes désactivées (span non focusable, pas de lien mort).
//
// Ne s'affiche que s'il y a plus d'une page — sinon l'en-tête de liste porte
// déjà le total.

export function Pagination({
  page,
  totalPages,
  total,
  label,
}: {
  page: number;
  totalPages: number;
  total: number;
  label: string; // nom au pluriel : « clients », « factures »…
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page"); // page 1 = URL propre (défaut)
    else params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  const arrowBase =
    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors";
  const arrowOn =
    "border-line bg-surface text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
  const arrowOff = "border-line-soft bg-surface-2 text-ink-3 opacity-60";

  return (
    <nav
      aria-label="Pagination"
      className="mt-gap flex items-center justify-between gap-3"
    >
      <p className="text-[13px] text-ink-3">
        Page <b className="num text-ink-2">{page}</b> sur{" "}
        <b className="num text-ink-2">{totalPages}</b> ·{" "}
        <b className="num text-ink-2">{total}</b> {label} au total
      </p>

      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span className={cn(arrowBase, arrowOff)} aria-disabled="true">
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Précédent
          </span>
        ) : (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            aria-label="Page précédente"
            className={cn(arrowBase, arrowOn)}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Précédent
          </Link>
        )}

        {nextDisabled ? (
          <span className={cn(arrowBase, arrowOff)} aria-disabled="true">
            Suivant
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
        ) : (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            aria-label="Page suivante"
            className={cn(arrowBase, arrowOn)}
          >
            Suivant
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        )}
      </div>
    </nav>
  );
}
