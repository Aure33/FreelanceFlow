import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUserProfile } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Le middleware garantit un utilisateur sur les routes (app) ; repli défensif.
  const user =
    (await getCurrentUserProfile()) ??
    ({ name: "Utilisateur", email: "", initials: "U" } as const);

  return (
    <div className="grid min-h-screen grid-cols-[var(--sidebar-w)_1fr]">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-content p-7">{children}</main>
      </div>
    </div>
  );
}
