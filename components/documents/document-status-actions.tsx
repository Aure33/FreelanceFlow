"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Pencil,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocType } from "@/lib/invoicing";
import {
  convertQuoteToInvoice,
  updateDocumentStatus,
  type DocumentStatus,
  type DocumentView,
} from "@/app/(app)/documents/actions";

// Actions de statut du panneau latéral de la vue Document. Client, car elles
// appellent les server actions ({ok}|{error}, pas de redirect) puis
// rafraîchissent/naviguent selon le résultat.
//
// « Convertir en facture » (#61) : actif uniquement sur un devis ACCEPTÉ non
// encore converti — crée un brouillon de facture (lignes copiées, traçabilité
// sourceQuoteId) puis ouvre l'éditeur dessus pour relecture et émission (le
// quota freemium reste du ressort d'emitDocument). Les actions restantes sans
// comportement spécifié (relance, dupliquer #66) restent désactivées.
export function DocumentStatusActions({
  type,
  id,
  status,
  sourceQuote = null,
  convertedInvoice = null,
}: {
  type: DocType;
  id: string;
  status: DocumentStatus;
  sourceQuote?: DocumentView["sourceQuote"];
  convertedInvoice?: DocumentView["convertedInvoice"];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDraft = status === "brouillon";

  function run(target: DocumentStatus) {
    setError(null);
    startTransition(async () => {
      const res = await updateDocumentStatus(id, target);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function convert() {
    setError(null);
    startTransition(async () => {
      const res = await convertQuoteToInvoice(id);
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/documents/nouveau?document=${res.id}`);
      }
    });
  }

  const btn = "w-full justify-center";

  return (
    <div className="flex flex-col gap-[9px]">
      {type === "facture" ? (
        <Button
          type="button"
          variant="primary"
          className={btn}
          disabled={pending || isDraft || status === "paye"}
          onClick={() => run("paye")}
        >
          <Check strokeWidth={2} />
          {status === "paye" ? "Facture payée" : "Marquer comme payé"}
        </Button>
      ) : (
        <>
          <Button
            type="button"
            variant="primary"
            className={btn}
            disabled={pending || isDraft || status === "accepte"}
            onClick={() => run("accepte")}
          >
            <Check strokeWidth={2} />
            {status === "accepte" ? "Devis accepté" : "Marquer comme accepté"}
          </Button>
          <Button
            type="button"
            variant="default"
            className={btn}
            disabled={pending || isDraft || status === "refuse"}
            onClick={() => run("refuse")}
          >
            <X strokeWidth={2} />
            {status === "refuse" ? "Devis refusé" : "Marquer comme refusé"}
          </Button>
        </>
      )}

      {type === "facture" ? (
        // Non branchée — désactivée (aucune automatisation d'envoi, cf. #69).
        <Button type="button" variant="default" className={btn} disabled>
          <Send strokeWidth={2} />
          Envoyer une relance
        </Button>
      ) : convertedInvoice ? (
        // Devis déjà converti : lien vers la facture (éditeur si brouillon).
        <Button asChild variant="default" className={btn}>
          <Link
            href={
              convertedInvoice.isDraft
                ? `/documents/nouveau?document=${convertedInvoice.id}`
                : `/factures/${convertedInvoice.id}`
            }
          >
            <ArrowRight strokeWidth={2} />
            {convertedInvoice.isDraft
              ? "Voir le brouillon de facture"
              : `Voir la facture ${convertedInvoice.number ?? ""}`.trim()}
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="default"
          className={btn}
          disabled={pending || status !== "accepte"}
          title={
            status !== "accepte"
              ? "Disponible quand le devis est accepté"
              : undefined
          }
          onClick={convert}
        >
          <ArrowRight strokeWidth={2} />
          Convertir en facture
        </Button>
      )}
      {isDraft && (
        // Reprise d'un brouillon dans l'éditeur (#61) — un brouillon n'a pas de
        // numéro : il reste entièrement modifiable et émissible.
        <Button asChild variant="primary" className={btn}>
          <Link href={`/documents/nouveau?document=${id}`}>
            <Pencil strokeWidth={2} />
            Reprendre dans l&apos;éditeur
          </Link>
        </Button>
      )}
      {isDraft ? (
        <Button
          type="button"
          variant="default"
          className={btn}
          disabled
          title="Émettez le document pour télécharger le PDF"
        >
          <Download strokeWidth={2} />
          Télécharger le PDF
        </Button>
      ) : (
        <Button asChild variant="default" className={btn}>
          <a href={`/api/documents/${id}/pdf`}>
            <Download strokeWidth={2} />
            Télécharger le PDF
          </a>
        </Button>
      )}
      <Button type="button" variant="default" className={btn} disabled>
        <Copy strokeWidth={2} />
        Dupliquer
      </Button>

      {isDraft && (
        <p className="text-[12.5px] leading-[1.5] text-ink-3">
          Ce document est un brouillon : reprenez-le dans l&apos;éditeur pour
          l&apos;émettre et en suivre le statut.
        </p>
      )}
      {sourceQuote && (
        // Traçabilité (#61) : cette facture est issue d'un devis converti.
        <p className="text-[12.5px] leading-[1.5] text-ink-3">
          Créée à partir du devis{" "}
          <Link
            href={`/devis/${sourceQuote.id}`}
            className="num font-semibold text-accent-ink hover:underline"
          >
            {sourceQuote.number ?? "brouillon"}
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
