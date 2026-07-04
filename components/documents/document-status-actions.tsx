"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Download, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocType } from "@/lib/invoicing";
import {
  updateDocumentStatus,
  type DocumentStatus,
} from "@/app/(app)/documents/actions";

// Actions de statut du panneau latéral de la vue Document. Client, car elles
// appellent la server action updateDocumentStatus ({ok}|{error}, pas de redirect)
// puis rafraîchissent la page (router.refresh) pour relire le statut effectif.
//
// Les actions non branchées à ce stade (relance, conversion, dupliquer, PDF) sont
// désactivées : aucune n'a de comportement spécifié / implémenté (PDF = #9).
export function DocumentStatusActions({
  type,
  id,
  status,
}: {
  type: DocType;
  id: string;
  status: DocumentStatus;
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

      {/* Actions non branchées — désactivées (aucune spec / dépendent de #9). */}
      {type === "facture" ? (
        <Button type="button" variant="default" className={btn} disabled>
          <Send strokeWidth={2} />
          Envoyer une relance
        </Button>
      ) : (
        <Button type="button" variant="default" className={btn} disabled>
          <ArrowRight strokeWidth={2} />
          Convertir en facture
        </Button>
      )}
      <Button
        type="button"
        variant="default"
        className={btn}
        disabled
        title="Bientôt disponible (#9)"
      >
        <Download strokeWidth={2} />
        Télécharger le PDF
      </Button>
      <Button type="button" variant="default" className={btn} disabled>
        <Copy strokeWidth={2} />
        Dupliquer
      </Button>

      {isDraft && (
        <p className="text-[12.5px] leading-[1.5] text-ink-3">
          Ce document est un brouillon : émettez-le pour en suivre le statut.
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
