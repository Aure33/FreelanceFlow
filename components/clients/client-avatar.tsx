import { cn } from "@/lib/utils";

// Pastille d'initiales du client (`.ini` de la maquette).
// La maquette utilisait une palette de 5 couleurs dont 2 en oklch codées en dur ;
// on la restreint ici à des paires 100 % tokens (accent/ok/warn/danger/neutral)
// pour respecter la règle « tokens uniquement » et rester correct dans les 2 thèmes.
const AVATAR_TONES = [
  "bg-accent-soft text-accent-ink",
  "bg-ok-soft text-ok-ink",
  "bg-warn-soft text-warn-ink",
  "bg-danger-soft text-danger-ink",
  "bg-surface-2 text-ink-2",
] as const;

const SIZES = {
  // liste : 38px / rayon 10 / 13px
  md: "h-[38px] w-[38px] rounded-md text-[13px]",
  // fiche : 54px / rayon 14 / 18px
  lg: "h-[54px] w-[54px] rounded-lg text-[18px]",
} as const;

// Initiales à partir du nom : 2 lettres (mots 1 & 2), sinon 2 premières lettres.
export function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Couleur stable dérivée d'une graine (id du client) : même client = même teinte.
function toneClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function ClientAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid flex-none place-items-center font-bold",
        SIZES[size],
        toneClass(seed),
        className,
      )}
    >
      {clientInitials(name)}
    </div>
  );
}
