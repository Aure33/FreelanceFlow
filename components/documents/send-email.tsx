"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { sendDocumentByEmail } from "@/app/(app)/documents/email-actions";
import { formatDateTime } from "./format";

// Îlot d'envoi par e-mail (issue #83) — visible sur la vue d'un document émis
// (devis ou facture). Le PDF (même rendu que le téléchargement, #9) part en
// pièce jointe via Resend. `router.refresh()` après succès recharge la page
// serveur pour afficher le nouvel horodatage `emailSentAt`.
export function SendEmail({
  id,
  defaultEmail,
  lastSentAt,
}: {
  id: string;
  defaultEmail: string | null;
  lastSentAt: Date | null;
}) {
  const [to, setTo] = useState(defaultEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await sendDocumentByEmail(id, { to });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">
          Envoyer par e-mail
        </h2>
      </div>
      <div className="p-pad">
        <form onSubmit={submit} noValidate>
          <label htmlFor="send-email-to" className="mb-1.5 block text-[12.5px] font-semibold text-ink-3">
            Adresse du client
          </label>
          <div className="flex gap-2">
            <input
              id="send-email-to"
              type="email"
              required
              autoComplete="off"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@exemple.fr"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-[38px] flex-none items-center gap-1.5 rounded-md border border-accent bg-accent px-3.5 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isPending ? (
                <Mail className="h-4 w-4 animate-pulse" strokeWidth={2} aria-hidden />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              Envoyer
            </button>
          </div>
        </form>

        {success && (
          <p role="status" className="mt-3 text-[12.5px] font-medium text-ok-ink">
            E-mail envoyé avec le PDF en pièce jointe.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[12.5px] font-medium text-danger-ink">
            {error}
          </p>
        )}
        {!success && !error && lastSentAt && (
          <p className="mt-3 text-[12.5px] text-ink-3">
            Dernier envoi : <span className="num">{formatDateTime(lastSentAt)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
