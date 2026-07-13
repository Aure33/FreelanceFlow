"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils";
import {
  deleteClient,
  updateClient,
  type ClientDetail,
} from "@/app/(app)/clients/actions";

// Champs de saisie (mêmes classes que le formulaire de création).
const INPUT =
  "h-[42px] w-full rounded-md border border-line bg-surface px-[13px] text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";

// Conditions de paiement proposées (identiques à la création). Si la fiche
// porte une valeur hors liste (donnée historique), on l'ajoute pour ne jamais
// écraser silencieusement une valeur existante.
const PAYMENT_TERMS = ["À réception", "30 jours", "45 jours fin de mois", "60 jours"];

// Bouton « Modifier » de la fiche client + modale d'édition/suppression (#58).
// L'édition reprend les champs de la création (validation zod côté serveur
// identique) ; la suppression est en 2 temps (confirmation) et le serveur
// refuse si des projets sont rattachés (RESTRICT).
export function EditClientButton({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(client.name);
  const [siret, setSiret] = useState(client.siret ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [paymentTerms, setPaymentTerms] = useState(client.paymentTerms ?? "30 jours");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  const terms = PAYMENT_TERMS.includes(paymentTerms)
    ? PAYMENT_TERMS
    : [paymentTerms, ...PAYMENT_TERMS];

  function openModal() {
    // Repart des valeurs de la fiche à chaque ouverture (annulation propre).
    setName(client.name);
    setSiret(client.siret ?? "");
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setAddress(client.address ?? "");
    setPaymentTerms(client.paymentTerms ?? "30 jours");
    setError(null);
    setConfirmingDelete(false);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du client est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateClient(client.id, {
      name,
      siret: siret || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      paymentTerms: paymentTerms || undefined,
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
    // deleteClient REDIRIGE vers /clients au succès → `res` est undefined ; on
    // ne traite l'erreur que si l'action en renvoie une (garde RESTRICT).
    const res = await deleteClient(client.id);
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
        title="Modifier le client"
        titleId="edit-client-title"
        initialFocusRef={firstFieldRef}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5">
            <div className="mb-3.5">
              <label htmlFor="ecNom" className={LABEL}>
                Nom / raison sociale
              </label>
              <input
                ref={firstFieldRef}
                id="ecNom"
                type="text"
                required
                className={INPUT}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="mb-3.5">
              <label htmlFor="ecSiret" className={LABEL}>
                SIRET <small className="font-medium text-ink-3">— facultatif</small>
              </label>
              <input
                id="ecSiret"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="123 456 789 00012"
                className={cn(INPUT, "font-mono text-[13.5px]")}
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
              />
            </div>

            <div className="mb-3.5 grid grid-cols-2 gap-[14px] max-[560px]:grid-cols-1">
              <div>
                <label htmlFor="ecTel" className={LABEL}>
                  Téléphone
                </label>
                <input
                  id="ecTel"
                  type="tel"
                  autoComplete="tel"
                  className={cn(INPUT, "font-mono text-[13.5px]")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ecEmail" className={LABEL}>
                  E-mail de facturation
                </label>
                <input
                  id="ecEmail"
                  type="email"
                  autoComplete="email"
                  className={INPUT}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3.5">
              <label htmlFor="ecAddr" className={LABEL}>
                Adresse
              </label>
              <input
                id="ecAddr"
                type="text"
                autoComplete="street-address"
                className={INPUT}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="ecCond" className={LABEL}>
                Conditions de paiement
              </label>
              <div className="relative">
                <select
                  id="ecCond"
                  className={cn(INPUT, "cursor-pointer appearance-none pr-[38px]")}
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                >
                  {terms.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
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
                si des projets sont rattachés (contrainte RESTRICT). */}
            <div className="mt-5 rounded-md border border-danger-line bg-danger-soft/40 px-3.5 py-3">
              {confirmingDelete ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13px] font-medium text-danger-ink">
                    Supprimer définitivement ce client ?
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
                    La suppression est impossible si des projets sont rattachés.
                  </span>
                  <Button
                    type="button"
                    variant="default"
                    className="ml-auto text-danger-ink"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 strokeWidth={2} />
                    Supprimer ce client
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
