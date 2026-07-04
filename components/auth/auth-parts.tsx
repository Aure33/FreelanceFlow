import Link from "next/link";

// Zone d'erreur annoncée aux lecteurs d'écran (toujours présente pour `aria-live`).
export function FormError({ message }: { message: string | null }) {
  return (
    <div aria-live="polite">
      {message && (
        <p className="mb-4 rounded-md bg-danger-soft px-[14px] py-[10px] text-[13px] font-medium text-danger-ink">
          {message}
        </p>
      )}
    </div>
  );
}

// Séparateur « ou » (traits de part et d'autre, comme `.sep`).
export function OrSeparator() {
  return (
    <div className="my-[22px] flex items-center gap-[14px] text-[12.5px] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

// Ligne de rappel sous le formulaire (« Pas encore de compte ? … »).
export function AuthSwitch({
  text,
  href,
  linkLabel,
}: {
  text: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mt-[26px] text-center text-[14px] text-ink-2">
      {text}{" "}
      <Link
        href={href}
        prefetch={false}
        className="font-[650] text-accent-ink hover:underline"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
