"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissOnboarding } from "@/app/(app)/dashboard/actions";

// « Ignorer ce guide » (issue #60) — exigence : l'onboarding est ignorable.
// Pose le cookie côté serveur puis rafraîchit : le dashboard classique (états
// vides propres #47) prend le relais. Pas dans la maquette (qui ne montre que
// l'état initial) : bouton discret, en position d'outil de page.
export function DismissOnboardingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDismiss() {
    setBusy(true);
    await dismissOnboarding();
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={handleDismiss}
      className="text-ink-3 hover:text-ink"
    >
      <X strokeWidth={2} />
      {busy ? "Un instant…" : "Ignorer ce guide"}
    </Button>
  );
}
