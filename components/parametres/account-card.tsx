"use client";

import { useRef, useState, useTransition } from "react";
import { KeyRound, LogOut, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { signOut } from "@/lib/auth/actions";
import {
  changeEmail,
  changePassword,
  deleteAccount,
} from "@/app/(app)/parametres/account-actions";
import { cn } from "@/lib/utils";
import { CARD_BODY, CARD_HEAD, CARD_TITLE, INPUT, LABEL, NOTE } from "./shared";

// Section « Compte » (#68) — gestion du compte : mot de passe, e-mail,
// déconnexion et suppression (droit à l'effacement RGPD, promis par la
// politique de confidentialité). Écarts maquette assumés : Profil.html ne
// prévoit que la déconnexion — ces blocs suivent les mêmes conventions
// visuelles que le reste de la page.

type Feedback = { type: "ok" | "error"; text: string } | null;

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.type === "error" ? "alert" : "status"}
      className={cn(
        "mt-2.5 text-[13px] font-medium",
        feedback.type === "error" ? "text-danger-ink" : "text-ok-ink",
      )}
    >
      {feedback.text}
    </p>
  );
}

export function AccountCard({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();

  // --- Mot de passe ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  // --- E-mail ---
  const [newEmail, setNewEmail] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);

  // --- Suppression ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordFeedback(null);
    startTransition(async () => {
      const res = await changePassword({ currentPassword, newPassword });
      if (res.error) {
        setPasswordFeedback({ type: "error", text: res.error });
      } else {
        setPasswordFeedback({ type: "ok", text: "Mot de passe mis à jour." });
        setCurrentPassword("");
        setNewPassword("");
      }
    });
  }

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailFeedback(null);
    startTransition(async () => {
      const res = await changeEmail({ newEmail });
      if (res.error) {
        setEmailFeedback({ type: "error", text: res.error });
      } else {
        setEmailFeedback({
          type: "ok",
          text: "Liens de confirmation envoyés à l'ancienne ET à la nouvelle adresse — le changement prendra effet après les deux clics.",
        });
        setNewEmail("");
      }
    });
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteError(null);
    // deleteAccount REDIRIGE vers / au succès → on ne revient ici qu'en erreur.
    const res = await deleteAccount({ confirmEmail });
    if (res?.error) {
      setDeleteError(res.error);
      setDeleting(false);
    }
  }

  const confirmMatches =
    confirmEmail.trim().toLowerCase() === email.toLowerCase();

  return (
    <section
      className="rounded-lg border border-danger-line bg-surface shadow-sm"
      id="compte"
    >
      <div className={CARD_HEAD}>
        <h2 className={`${CARD_TITLE} text-danger-ink`}>Compte</h2>
      </div>
      <div className={CARD_BODY}>
        {/* --- Mot de passe ------------------------------------------------- */}
        <form onSubmit={submitPassword} noValidate>
          <b className="mb-3 block text-sm font-semibold">
            Changer de mot de passe
          </b>
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-[640px]:grid-cols-1">
            <div>
              <label htmlFor="accCurPwd" className={LABEL}>
                Mot de passe actuel
              </label>
              <input
                id="accCurPwd"
                type="password"
                autoComplete="current-password"
                className={INPUT}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="accNewPwd" className={LABEL}>
                Nouveau mot de passe
              </label>
              <input
                id="accNewPwd"
                type="password"
                autoComplete="new-password"
                className={INPUT}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className={NOTE}>8 caractères minimum, dont un chiffre.</p>
            </div>
          </div>
          <Button type="submit" variant="default" size="sm" disabled={isPending}>
            <KeyRound strokeWidth={2} />
            Mettre à jour le mot de passe
          </Button>
          <FeedbackText feedback={passwordFeedback} />
        </form>

        <hr className="my-5 border-none border-t border-line-soft" />

        {/* --- E-mail -------------------------------------------------------- */}
        <form onSubmit={submitEmail} noValidate>
          <b className="mb-3 block text-sm font-semibold">
            Changer d&apos;adresse e-mail
          </b>
          <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-[640px]:grid-cols-1">
            <div>
              <label htmlFor="accCurEmail" className={LABEL}>
                Adresse actuelle
              </label>
              <input
                id="accCurEmail"
                type="email"
                disabled
                className={INPUT}
                value={email}
              />
            </div>
            <div>
              <label htmlFor="accNewEmail" className={LABEL}>
                Nouvelle adresse
              </label>
              <input
                id="accNewEmail"
                type="email"
                autoComplete="email"
                placeholder="nouvelle@adresse.fr"
                className={INPUT}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" variant="default" size="sm" disabled={isPending}>
            <Mail strokeWidth={2} />
            Changer d&apos;adresse
          </Button>
          <FeedbackText feedback={emailFeedback} />
        </form>

        <hr className="my-5 border-none border-t border-line-soft" />

        {/* --- Déconnexion ----------------------------------------------------- */}
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <b className="block text-sm font-semibold">Se déconnecter</b>
            <small className="text-[13px] text-ink-3">
              {email} · connecté(e) depuis ce navigateur
            </small>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="default"
              className="border-danger-line text-danger-ink hover:bg-danger-soft"
            >
              <LogOut strokeWidth={2} />
              Déconnexion
            </Button>
          </form>
        </div>

        <hr className="my-5 border-none border-t border-line-soft" />

        {/* --- Suppression (droit à l'effacement) ------------------------------- */}
        <div className="flex flex-wrap items-center gap-3.5 rounded-md border border-danger-line bg-danger-soft/40 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <b className="block text-sm font-semibold text-danger-ink">
              Supprimer mon compte
            </b>
            <small className="text-[12.5px] leading-[1.5] text-ink-3">
              Effacement définitif de toutes vos données (clients, projets,
              devis, factures, profil) — droit à l&apos;effacement RGPD.
            </small>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setConfirmEmail("");
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 strokeWidth={2} />
            Supprimer…
          </Button>
        </div>
      </div>

      {/* Modale de confirmation forte */}
      <ModalShell
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer définitivement le compte"
        titleId="delete-account-title"
        initialFocusRef={confirmRef}
      >
        <form onSubmit={confirmDelete} noValidate>
          <div className="px-6 py-5">
            <p className="mb-3.5 text-[13.5px] leading-[1.6] text-ink-2">
              Cette action est <b className="font-[650] text-danger-ink">irréversible</b>{" "}
              : vos clients, projets, devis, factures et votre profil seront
              définitivement effacés. Les PDF déjà téléchargés restent chez
              vous — pensez à exporter ce dont vous avez besoin avant.
            </p>
            <label htmlFor="accDelConfirm" className={LABEL}>
              Pour confirmer, saisissez l&apos;adresse e-mail du compte
            </label>
            <input
              ref={confirmRef}
              id="accDelConfirm"
              type="email"
              autoComplete="off"
              placeholder={email}
              className={INPUT}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
            {deleteError && (
              <p
                role="alert"
                className="mt-3 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger-ink"
              >
                {deleteError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2.5 rounded-b-xl border-t border-line-soft bg-surface-2 px-6 py-4">
            <Button
              type="button"
              variant="default"
              onClick={() => setDeleteOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!confirmMatches || deleting}
              title={
                confirmMatches ? undefined : "Saisissez l'adresse exacte du compte"
              }
            >
              <Trash2 strokeWidth={2} />
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </Button>
          </div>
        </form>
      </ModalShell>
    </section>
  );
}
