"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { formatEuros } from "@/lib/invoicing";
import { computeInitials } from "@/lib/auth/initials";
import {
  markNotificationsRead,
  type Notifications,
  type NotificationItem,
} from "@/app/(app)/notifications";

// Cloche de notifications (issue #69) — remplace le bouton décoratif de la
// topbar. Popover accessible (non modal) alimenté par getNotifications()
// (chargé au niveau layout, aucune requête à l'ouverture). A11y : bouton
// aria-haspopup + aria-expanded, panneau role="dialog" étiqueté, Échap ferme
// et rend le focus au bouton, clic extérieur ferme.
//
// ⚠️ La topbar a un backdrop-blur → containing block CSS pour `position:fixed`
// (cf. #63). Le panneau est donc en `position:absolute` sous un parent
// `relative` (l'absolu se cale sur l'ancêtre positionné, indépendant du blur),
// et la topbar n'a pas d'overflow → aucun rognage.

function itemMeta(item: NotificationItem): string {
  if (item.kind === "facture_retard") {
    return `${item.number} · échéance dépassée de ${item.days} j`;
  }
  return `${item.number} · envoyé il y a ${item.days} jour${
    item.days > 1 ? "s" : ""
  }`;
}

export function NotificationsBell({
  notifications,
}: {
  notifications: Notifications;
}) {
  const { items, unreadCount } = notifications;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Fermeture au clic extérieur + Échap (avec retour du focus au bouton).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // À l'ouverture, déplace le focus dans le panneau (première zone focusable).
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  function markRead() {
    startTransition(async () => {
      await markNotificationsRead();
      router.refresh(); // recalcule le badge côté serveur
    });
  }

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Bell className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="num absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-topbar bg-danger px-[3px] text-[10px] font-bold leading-none text-on-accent"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
            <b className="text-sm font-bold tracking-[-0.01em]">Notifications</b>
            {unreadCount > 0 && (
              <span className="num rounded-full bg-danger-soft px-2 py-px text-[11px] font-bold text-danger-ink">
                {unreadCount}
              </span>
            )}
            <button
              type="button"
              onClick={markRead}
              disabled={unreadCount === 0 || isPending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Check className="h-[14px] w-[14px]" strokeWidth={2.2} aria-hidden />
              Tout marquer comme lu
            </button>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">
              Aucune notification · tout est à jour
            </div>
          ) : (
            <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
              {items.map((item) => {
                const danger = item.kind === "facture_retard";
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border-b border-line-soft px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    >
                      <span
                        aria-hidden
                        className={`grid h-9 w-9 flex-none place-items-center rounded-[9px] text-[13px] font-bold ${
                          danger
                            ? "bg-danger-soft text-danger-ink"
                            : "bg-warn-soft text-warn-ink"
                        }`}
                      >
                        {computeInitials(item.clientName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px] font-semibold">
                          {item.clientName}
                        </b>
                        <small className="block truncate text-[12px] text-ink-3">
                          {itemMeta(item)}
                        </small>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        <span className="num text-[13px] font-semibold">
                          {formatEuros(item.amountTtcCents)}
                        </span>
                        {item.unread && (
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full bg-accent"
                          />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/factures"
            onClick={() => setOpen(false)}
            className="block border-t border-line-soft px-4 py-2.5 text-center text-[12.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none"
          >
            Voir les pièces à traiter
          </Link>
        </div>
      )}
    </div>
  );
}
