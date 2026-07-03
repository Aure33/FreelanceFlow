import type { Metadata } from "next";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Freelance Flow",
    template: "Freelance Flow — %s",
  },
  description:
    "Devis et factures conformes pour indépendants, en moins de 2 minutes.",
};

// Applique le thème persisté avant le premier rendu pour éviter le flash
// (équivalent de design_ref/.../scripts/theme.js, clé localStorage « ff-theme »).
const themeScript = `(function(){var t;try{t=localStorage.getItem('ff-theme')}catch(e){}document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
