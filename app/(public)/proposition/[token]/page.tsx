import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { DocumentPaper } from "@/components/documents/document-paper";
import { QuoteResponse } from "@/components/public/quote-response";
import { getPublicQuote } from "@/app/(app)/documents/actions";

// Page PUBLIQUE d'un devis partagé (issue #85) — hors shell applicatif et hors
// authentification (chemin `/proposition/...`, non protégé par le middleware).
// Le client consulte le devis (rendu A4 en lecture seule, DocumentPaper) et
// l'accepte / le refuse sans compte. L'accès est validé par le SEUL jeton :
// getPublicQuote filtre `where { publicToken, type: 'devis' }` → un jeton
// invalide ou révoqué rend la 404 (app/not-found.tsx, #67).

export const metadata: Metadata = {
  title: "Proposition commerciale",
  robots: { index: false, follow: false }, // lien privé partagé, non indexable
};

export default async function PublicQuotePage({
  params,
}: {
  params: { token: string };
}) {
  const view = await getPublicQuote(params.token);
  if (!view) notFound();

  const emitterName = view.emitter.name;
  const pending = view.status === "envoye";
  const accepted = view.status === "accepte";
  const refused = view.status === "refuse";

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        {/* En-tête sobre : émetteur + objet, pas de navigation applicative. */}
        <header className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Proposition commerciale
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.02em]">
            {emitterName ?? "Devis"}
            {view.number ? (
              <span className="num ml-2 font-semibold text-ink-3">
                {view.number}
              </span>
            ) : null}
          </h1>
        </header>

        {/* Bannière de statut si déjà tranché */}
        {accepted && (
          <div className="flex items-center justify-center gap-2 rounded-md bg-ok-soft px-4 py-3 text-[14px] font-semibold text-ok-ink">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            Devis accepté — merci ! L&apos;émetteur en est informé.
          </div>
        )}
        {refused && (
          <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 px-4 py-3 text-[14px] font-semibold text-ink-2">
            <XCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            Ce devis a été refusé.
          </div>
        )}

        {/* Papier A4 en lecture seule (composant partagé avec la vue interne) */}
        <DocumentPaper view={view} />

        {/* Réponse client (uniquement si le devis est en attente) */}
        {pending && <QuoteResponse token={params.token} />}

        <p className="pb-4 text-center text-[12px] text-ink-3">
          Propulsé par Freelance Flow
        </p>
      </div>
    </main>
  );
}
