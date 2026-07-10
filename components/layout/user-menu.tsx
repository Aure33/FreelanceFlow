"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import type { UserProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

// User-chip de la sidebar : affiche le vrai utilisateur et ouvre un menu
// avec la déconnexion (server action signOut, utilisable même sans JS).
export function UserMenu({ name, email, initials }: UserProfile) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    logoutRef.current?.focus();
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {open && (
        <div
          role="menu"
          aria-label="Menu utilisateur"
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-md"
        >
          <form action={signOut}>
            <button
              ref={logoutRef}
              role="menuitem"
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <LogOut className="h-4 w-4 flex-none" strokeWidth={2} aria-hidden />
              Déconnexion
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-[11px] rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <div
          className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full text-[13px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.55 0.13 264), oklch(0.5 0.12 295))",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-semibold leading-tight">
            {name}
          </b>
          <small className="block truncate text-xs text-ink-3">{email}</small>
        </div>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 flex-none text-ink-3 transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    </div>
  );
}
