import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
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

  return (
    <div className="grid min-h-screen grid-cols-[var(--sidebar-w)_1fr] print:block">
      <Sidebar user={user} usage={usage} counts={counts} />
      <div className="flex min-w-0 flex-col">
        <Topbar notifications={notifications} />
        <main className="mx-auto w-full max-w-content p-7 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
