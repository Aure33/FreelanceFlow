"use client";

import Link from "next/link";
import type { Usage } from "@/app/(app)/abonnement/actions";

// Garde-fou de création (issue #10, AC #1) : la vraie garde de sécurité est
// côté serveur (emitDocument() refuse déjà au-delà du quota) — ceci est
// uniquement l'UX qui empêche même la navigation vers l'éditeur quand on sait
// déjà, côté client, que la limite est atteinte.
export function isLimitReached(usage: Usage): boolean {
  return (
    usage.planType === "free" &&
    usage.documentsLimit !== null &&
    usage.documentsThisMonth >= usage.documentsLimit
  );
}

// Lien de création (« Nouvelle facture », « Nouveau devis », « Créer »…) qui
// intercepte le clic si le quota est atteint : empêche la navigation et
// délègue l'ouverture de la modale paywall à l'appelant via `onBlocked`
// (reçoit l'élément déclencheur, pour restituer le focus à la fermeture).
export function GatedCreateLink({
  usage,
  href,
  onBlocked,
  className,
  children,
}: {
  usage: Usage;
  href: string;
  onBlocked: (trigger: HTMLAnchorElement) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (isLimitReached(usage)) {
          e.preventDefault();
          onBlocked(e.currentTarget);
        }
      }}
    >
      {children}
    </Link>
  );
}
