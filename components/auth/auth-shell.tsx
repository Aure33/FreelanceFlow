import type { ReactNode } from "react";

// Layout 2 colonnes plein écran des écrans d'authentification.
// Sous 900px : une seule colonne, le panneau « promesse » est masqué (cf. maquettes).
export function AuthShell({
  pitch,
  children,
}: {
  pitch: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-bg min-[901px]:grid-cols-2">
      {pitch}
      {/* Panneau droit : formulaire (auth-box 380px centrée). */}
      <section className="flex items-center justify-center px-[32px] py-[48px]">
        <div className="w-full max-w-[380px]">{children}</div>
      </section>
    </main>
  );
}
