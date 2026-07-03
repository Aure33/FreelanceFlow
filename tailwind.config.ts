import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        line: {
          DEFAULT: "var(--line)",
          soft: "var(--line-soft)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
          line: "var(--accent-line)",
        },
        "on-accent": "var(--on-accent)",
        ok: {
          DEFAULT: "var(--ok)",
          soft: "var(--ok-soft)",
          ink: "var(--ok-ink)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
          ink: "var(--warn-ink)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
          ink: "var(--danger-ink)",
          line: "var(--danger-line)",
        },
        topbar: "var(--topbar-bg)",
        "badge-active": "var(--badge-active-bg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        sidebar: "var(--sidebar-w)",
        topbar: "var(--topbar-h)",
        gap: "var(--gap)",
        pad: "var(--pad)",
      },
      maxWidth: {
        content: "1320px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
