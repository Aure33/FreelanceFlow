"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";
import {
  deleteProject,
  updateProject,
  type ProjectDetail,
  type ProjectStatus,
} from "@/app/(app)/projets/actions";
import { STATUS_META } from "./status";

// Champs de saisie (mêmes classes que la modale de création).
const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";

// Bouton « Modifier » de la fiche projet + modale d'édition/suppression (#58).
// Titre, statut et description modifiables ; le CLIENT de rattachement ne
// l'est pas (les documents émis du projet affichent ce client — le re-parenter
// réécrirait leur historique). La suppression est en 2 temps et le serveur
// refuse si des documents sont rattachés (RESTRICT).
export function EditProjectButton({ project }: { project: ProjectDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [notes, setNotes] = useState(project.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  function openModal() {
    // Repart des valeurs de la fiche à chaque ouverture (annulation propre).
    setName(project.name);
    setStatus(project.status);
    setNotes(project.notes ?? "");
    setError(null);
    setConfirmingDelete(false);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le titre de la mission est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateProject(project.id, {
      name,
      status,
      notes: notes || undefined,
    });
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    // deleteProject REDIRIGE vers /projets au succès → `res` est undefined ; on
    // ne traite l'erreur que si l'action en renvoie une (garde RESTRICT).
    const res = await deleteProject(project.id);
    if (res?.error) {
      setError(res.error);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <>
      <Button type="button" variant="default" onClick={openModal}>
        <Pencil strokeWidth={2} />
        Modifier
      </Button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title="Modifier le projet"
        titleId="edit-project-title"
        initialFocusRef={firstFieldRef}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5">
            <div className="mb-3.5">
              <label htmlFor="epTitre" className={LABEL}>
                Titre de la mission
              </label>
              <input
                ref={firstFieldRef}
                id="epTitre"
                type="text"
                required
                className={INPUT}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="mb-3.5 grid grid-cols-2 gap-[14px] max-[560px]:grid-cols-1">
              <div>
                <label htmlFor="epStatut" className={LABEL}>
                  Statut
                </label>
                <div className="relative">
                  <select
                    id="epStatut"
                    className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  >
                    {(Object.keys(STATUS_META) as ProjectStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
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
                <span className={LABEL}>Client</span>
                {/* Rattachement non modifiable : affiché pour information. */}
                <div
                  className={cn(
                    INPUT,
                    "flex items-center bg-surface-2 text-ink-3",
                  )}
                  title="Le client d'un projet n'est pas modifiable."
                >
                  {project.clientName}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="epDesc" className={LABEL}>
                Description{" "}
                <small className="font-medium text-ink-3">— facultatif</small>
              </label>
              <textarea
                id="epDesc"
                placeholder="Périmètre, livrables, jalons…"
                className={cn(INPUT, "h-auto min-h-[76px] resize-y py-2.5 leading-[1.5]")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="mt-3.5 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
              >
                {error}
              </div>
            )}

            {/* Zone de suppression — confirmation en 2 temps. Le serveur refuse
                si des documents sont rattachés (contrainte RESTRICT). */}
            <div className="mt-5 rounded-md border border-danger-line bg-danger-soft/40 px-3.5 py-3">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] font-medium text-danger-ink">
                    Supprimer définitivement ce projet ?
                  </span>
                  <span className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Annuler
                    </Button>
                    <Button type="button" variant="danger" disabled={deleting} onClick={handleDelete}>
                      <Trash2 strokeWidth={2} />
                      {deleting ? "Suppression…" : "Confirmer la suppression"}
                    </Button>
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[12.5px] leading-[1.5] text-ink-3">
                    La suppression est impossible si des documents sont rattachés.
                  </span>
                  <Button
                    type="button"
                    variant="default"
                    className="ml-auto text-danger-ink"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 strokeWidth={2} />
                    Supprimer ce projet
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Pied */}
          <div className="flex justify-end gap-2.5 rounded-b-xl border-t border-line-soft bg-surface-2 px-6 py-4">
            <Button type="button" variant="default" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              <Check strokeWidth={2} />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </ModalShell>
    </>
  );
}
