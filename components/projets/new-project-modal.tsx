"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createProject,
  type ClientOption,
} from "@/app/(app)/projets/actions";

// Champs de saisie (reproduit `.input` / `.select` / `.textarea` de la maquette).
const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";

// Modale « Nouveau projet » — accessible (role=dialog, aria-modal, focus trap,
// Échap + clic-extérieur, prefers-reduced-motion respecté via motion-reduce).
// Un projet exige un client : si l'utilisateur n'en a aucun, on l'invite à en
// créer un et on désactive la soumission.
export function NewProjectModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
}) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const titleId = "new-project-title";

  const hasClients = clients.length > 0;

  // Focus trap + Échap + restauration du focus sur l'élément déclencheur.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus initial : premier champ (ou le conteneur si aucun client).
    (firstFieldRef.current ?? modalRef.current)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le titre de la mission est requis.");
      return;
    }
    if (!clientId) {
      setError("Le client est requis.");
      return;
    }
    setLoading(true);
    setError(null);
    // createProject REDIRIGE vers la fiche au succès → `res` est undefined ; on
    // ne traite l'erreur que si l'action en renvoie une (cf. bug #23).
    const res = await createProject({
      name,
      clientId,
      notes: notes || undefined,
    });
    if (res?.error) {
      setError(res.error);
      setLoading(false);
    }
  }

  return (
    <>
      {/* Fond assombri — clic pour fermer */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[oklch(0.25_0.01_75_/_0.32)] animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        aria-hidden
      />

      {/* Modale */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface shadow-lg outline-none animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 border-b border-line-soft px-6 pb-4 pt-5">
          <h2 id={titleId} className="text-[17px] font-[750] tracking-[-0.02em]">
            Nouveau projet
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-surface-2"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Corps */}
          <div className="px-6 py-5">
            {hasClients ? (
              <>
                <div className="mb-3.5">
                  <label htmlFor="pTitre" className={LABEL}>
                    Titre de la mission
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="pTitre"
                    type="text"
                    required
                    placeholder="Ex. : Refonte du site vitrine"
                    className={INPUT}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="mb-3.5">
                  <label htmlFor="pClient" className={LABEL}>
                    Client
                  </label>
                  <div className="relative">
                    <select
                      id="pClient"
                      required
                      className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    >
                      <option value="" disabled>
                        Sélectionner un client…
                      </option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pDesc" className={LABEL}>
                    Description{" "}
                    <small className="font-medium text-ink-3">— facultatif</small>
                  </label>
                  <textarea
                    id="pDesc"
                    placeholder="Périmètre, livrables, jalons…"
                    className={cn(
                      INPUT,
                      "h-auto min-h-[76px] resize-y py-2.5 leading-[1.5]",
                    )}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </>
            ) : (
              // Cas « aucun client » : un projet doit être rattaché à un client.
              <div className="flex flex-col items-center gap-3 rounded-md border border-line-soft bg-surface-2 px-6 py-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div className="text-sm font-semibold text-ink">
                  Créez d&apos;abord un client
                </div>
                <p className="max-w-[320px] text-[13px] leading-[1.5] text-ink-3">
                  Un projet est toujours rattaché à un client. Ajoutez-en un pour
                  pouvoir créer votre premier projet.
                </p>
                <Button asChild variant="primary" className="mt-1">
                  <Link href="/clients/nouveau">
                    <UserPlus strokeWidth={2} />
                    Nouveau client
                  </Link>
                </Button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3.5 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
              >
                {error}
              </div>
            )}
          </div>

          {/* Pied */}
          <div className="flex justify-end gap-2.5 rounded-b-xl border-t border-line-soft bg-surface-2 px-6 py-4">
            <Button type="button" variant="default" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!hasClients || loading}
            >
              <Check strokeWidth={2} />
              {loading ? "Création…" : "Créer le projet"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
