import { Sidebar } from "@/components/layout/sidebar";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getUsage } from "@/app/(app)/abonnement/actions";
import { getNavCounts } from "@/app/(app)/nav-counts";
import { getNotifications } from "@/app/(app)/notifications";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Le middleware garantit un utilisateur sur les routes (app) ; repli défensif.
  // Tout est chargé en PARALLÈLE (un seul aller-retour perçu, cf. #56) — les
  // notifications restent légères (2 findMany bornés, cf. notifications.ts).
  const [profile, usage, counts, notifications] = await Promise.all([
    getCurrentUserProfile(),
    getUsage(),
    getNavCounts(),
    getNotifications(),
  ]);
  const user =
    profile ?? ({ name: "Utilisateur", email: "", initials: "U" } as const);

  // Coquille responsive (#96) : desktop identique (grille sidebar + contenu),
  // mobile = sidebar en tiroir piloté par la topbar (état client dans AppShell).
  return (
    <AppShell
      sidebar={<Sidebar user={user} usage={usage} counts={counts} />}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
