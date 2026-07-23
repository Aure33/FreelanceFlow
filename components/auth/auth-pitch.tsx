import type { ReactNode } from "react";

// Panneau gauche « promesse » des écrans d'authentification.
// Fond sombre FIGÉ dans les deux thèmes (valeurs oklch en dur), comme la bande
// CTA de la landing : exception décorative assumée. `var(--ink)` s'inverserait
// en thème sombre, on le remplace donc par sa valeur du thème clair.
export function AuthPitch({ children }: { children: ReactNode }) {
  return (
    <section className="relative hidden flex-col overflow-hidden bg-[oklch(0.23_0.012_75)] p-[56px] text-[oklch(0.95_0.005_95)] min-[901px]:flex">
      {/* Marque (sans ombre sur ce fond, comme la maquette). */}
      <div className="flex items-center gap-[11px]">
        <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-accent text-[16px] font-extrabold text-on-accent">
          F
        </div>
        <div className="text-[16px] font-bold tracking-[-0.02em] text-[oklch(0.97_0.005_95)]">
          Freelance<span className="text-[oklch(0.75_0.09_264)]">Flow</span>
        </div>
      </div>

      {/* Contenu central (varie selon l'écran). */}
      <div className="my-auto max-w-[420px]">{children}</div>

      <div className="text-[12.5px] text-[oklch(0.72_0.008_95)]">
        Hébergé en France · Données chiffrées · RGPD
      </div>

      {/* Halo décoratif discret. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[180px] -right-[180px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,oklch(0.48_0.14_264/0.35),transparent_70%)]"
      />
    </section>
  );
}

// Titre + accroche du panneau (mêmes styles sur les 4 écrans).
export function PitchHeading({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <h2 className="mb-[18px] text-[34px] font-extrabold leading-[1.18] tracking-[-0.03em] [text-wrap:balance]">
        {title}
      </h2>
      <p className="text-[15.5px] leading-[1.65] text-[oklch(0.78_0.008_95)] [text-wrap:pretty]">
        {children}
      </p>
    </>
  );
}
