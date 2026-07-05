import { SettingsView } from "@/components/parametres/settings-view";
import { getProfile } from "./actions";

// Page Paramètres (issue #12) — reproduit Profil.html. `getProfile()` filtre
// déjà par userId côté server action (requireUserId()) ; `planType` y est
// inclus, inutile d'appeler getUsage() séparément.
export default async function ParametresPage() {
  const profile = await getProfile();

  return <SettingsView profile={profile} />;
}
