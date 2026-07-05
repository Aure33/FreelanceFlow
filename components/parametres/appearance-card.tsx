"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, CARD_BODY, CARD_DESC, CARD_HEAD, CARD_TITLE } from "./shared";

type Theme = "light" | "dark";

const THEMES: { value: Theme; label: string; sub: string }[] = [
  { value: "light", label: "Clair", sub: "Thème par défaut" },
  { value: "dark", label: "Sombre", sub: "Repose les yeux le soir" },
];

// Applique le thème exactement comme le script anti-flash de app/layout.tsx :
// localStorage['ff-theme'] + data-theme sur <html>, sans rechargement.
function applyTheme(theme: Theme) {
  try {
    localStorage.setItem("ff-theme", theme);
  } catch {
    // Stockage indisponible (navigation privée…) : le thème reste appliqué
    // pour la session en cours, simplement non persisté.
  }
  document.documentElement.setAttribute("data-theme", theme);
}

// Section « Apparence » — 2 cartes radio Clair/Sombre. Les couleurs des
// mini-aperçus (`.prev`) sont volontairement FIXES (pas de token) : elles
// illustrent à quoi ressemble CHAQUE thème, y compris celui qui n'est pas
// actif — comme le document A4, seule autre exception documentée du projet.
export function AppearanceCard() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function select(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <section className={CARD} id="apparence">
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>Apparence</h2>
      </div>
      <div className={CARD_BODY}>
        <p className={CARD_DESC}>
          Préférence enregistrée sur cet appareil et appliquée à toute
          l&apos;application.
        </p>
        <div
          role="radiogroup"
          aria-label="Thème de l'interface"
          className="grid max-w-[460px] grid-cols-2 gap-3.5 max-[520px]:grid-cols-1"
        >
          {THEMES.map((t) => {
            const active = theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => select(t.value)}
                className={cn(
                  "relative rounded-md border-[1.5px] border-line bg-surface p-2.5 text-left transition-colors hover:border-accent-line",
                  active && "border-accent ring-1 ring-accent",
                )}
              >
                {active && (
                  <span className="absolute right-2.5 top-2.5 grid h-[17px] w-[17px] place-items-center rounded-full bg-accent text-on-accent">
                    <Check className="h-[11px] w-[11px]" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <span
                  className="mb-[9px] flex h-[72px] overflow-hidden rounded-[7px] border border-line-soft"
                  style={{
                    background:
                      t.value === "light"
                        ? "oklch(0.985 0.004 95)"
                        : "oklch(0.185 0.006 75)",
                  }}
                  aria-hidden
                >
                  <span
                    className="w-[26%]"
                    style={{
                      background: t.value === "light" ? "#fff" : "oklch(0.23 0.007 75)",
                      borderRight: `1px solid ${
                        t.value === "light" ? "oklch(0.92 0.005 95)" : "oklch(0.3 0.01 75)"
                      }`,
                    }}
                  />
                  <span className="flex flex-1 flex-col gap-[5px] p-2.5">
                    <span
                      className="h-1.5 w-[55%] rounded-[3px]"
                      style={{
                        background:
                          t.value === "light" ? "oklch(0.48 0.14 264)" : "oklch(0.62 0.13 264)",
                      }}
                    />
                    <span
                      className="h-1.5 w-full rounded-[3px]"
                      style={{
                        background: t.value === "light" ? "oklch(0.92 0.005 95)" : "oklch(0.32 0.01 75)",
                      }}
                    />
                    <span
                      className="h-1.5 w-[70%] rounded-[3px]"
                      style={{
                        background: t.value === "light" ? "oklch(0.92 0.005 95)" : "oklch(0.32 0.01 75)",
                      }}
                    />
                  </span>
                </span>
                <b className="text-[13.5px]">{t.label}</b>
                <small className="block text-xs text-ink-3">{t.sub}</small>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
