// Stub temporaire le temps d'implémenter chaque écran des maquettes.
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-pad shadow-sm">
      <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
      <p className="mt-1 text-sm text-ink-3">
        Écran à implémenter à partir de la maquette correspondante dans
        design_ref/.
      </p>
    </div>
  );
}
