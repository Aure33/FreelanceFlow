"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToQuote } from "@/app/(app)/documents/actions";

// Îlot client de réponse à un devis public (issue #85) — accepter / refuser
// SANS compte, validé par le seul jeton. Après l'action, router.refresh()
// recharge la page serveur (statut recalculé → bannière de confirmation).
export function QuoteResponse({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function respond(decision: "accept" | "refuse") {
    setError(null);
    startTransition(async () => {
      const res = await respondToQuote(token, decision);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-[595px]">
      <p className="mb-3 text-center text-[13.5px] text-ink-2">
        Vous pouvez répondre à cette proposition :
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          onClick={() => respond("accept")}
        >
          <Check strokeWidth={2} />
          Accepter le devis
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={isPending}
          onClick={() => respond("refuse")}
        >
          <X strokeWidth={2} />
          Refuser
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-danger-soft px-3.5 py-2.5 text-center text-[13px] font-medium text-danger-ink"
        >
          {error}
        </p>
      )}
    </div>
  );
}
