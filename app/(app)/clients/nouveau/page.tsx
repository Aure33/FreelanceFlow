import { Clock, ShieldCheck } from "lucide-react";
import { ClientBreadcrumb } from "@/components/clients/client-breadcrumb";
import { ClientForm } from "@/components/clients/client-form";

export default function NouveauClientPage() {
  return (
    <>
      <ClientBreadcrumb current="Nouveau client" />

      <div className="grid grid-cols-[minmax(0,680px)_320px] items-start gap-gap max-[1100px]:grid-cols-1">
        <ClientForm />

        {/* Aide latérale (`.help`) — items alignés sur les champs réellement
            présents : la carte « TVA » de la maquette est retirée (le taux de TVA
            par client n'est pas encore modélisé). */}
        <aside className="sticky top-[calc(var(--topbar-h)+28px)] flex flex-col gap-gap max-[1100px]:static">
          <section className="rounded-lg border border-line bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-line-soft px-pad py-[18px]">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                Pourquoi ces informations ?
              </h2>
            </div>
            <div className="px-pad py-2.5">
              <div className="flex gap-3 py-[13px]">
                <ShieldCheck
                  className="mt-0.5 h-[18px] w-[18px] flex-none text-accent-ink"
                  strokeWidth={2}
                  aria-hidden
                />
                <div>
                  <b className="mb-0.5 block text-[13.5px] font-[650]">
                    Le SIRET sécurise vos factures
                  </b>
                  <p className="text-[13px] leading-[1.55] text-ink-2">
                    Il identifie légalement votre client professionnel et apparaît
                    sur chaque document émis.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 border-t border-line-soft py-[13px]">
                <Clock
                  className="mt-0.5 h-[18px] w-[18px] flex-none text-accent-ink"
                  strokeWidth={2}
                  aria-hidden
                />
                <div>
                  <b className="mb-0.5 block text-[13.5px] font-[650]">
                    Les conditions pilotent les relances
                  </b>
                  <p className="text-[13px] leading-[1.55] text-ink-2">
                    L&apos;échéance est calculée à l&apos;émission et les relances de paiement
                    se déclenchent au bon moment.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
