import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getUsage } from "@/app/(app)/abonnement/actions";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Le middleware garantit un utilisateur sur les routes (app) ; repli défensif.
  const [profile, usage] = await Promise.all([
    getCurrentUserProfile(),
    getUsage(),
  ]);
  const user =
    profile ?? ({ name: "Utilisateur", email: "", initials: "U" } as const);

  return (
    <div className="grid min-h-screen grid-cols-[var(--sidebar-w)_1fr] print:block">
      <Sidebar user={user} usage={usage} />
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-content p-7 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
