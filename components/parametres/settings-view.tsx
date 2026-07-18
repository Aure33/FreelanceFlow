import type { ProfileData } from "@/app/(app)/parametres/actions";
import { TocNav } from "./toc-nav";
import { IdentityCard } from "./identity-card";
import { LegalCard } from "./legal-card";
import { TvaCard } from "./tva-card";
import { BankCard } from "./bank-card";
import { BillingPrefsCard } from "./billing-prefs-card";
import { RemindersCard } from "./reminders-card";
import { AppearanceCard } from "./appearance-card";
import { AccountCard } from "./account-card";

// Page Paramètres (issue #12) — reproduit la structure `.settings` de
// Profil.html : sommaire sticky à ancres (210px) + panneau de cartes (720px
// max), grid `210px 1fr`, gap 36px ; passe en une colonne sous 1000px.
export function SettingsView({ profile }: { profile: ProfileData }) {
  return (
    <div className="grid grid-cols-[210px_1fr] items-start gap-9 max-[1000px]:grid-cols-1">
      <TocNav />
      <div className="flex max-w-[720px] flex-col gap-gap">
        <IdentityCard profile={profile} />
        <LegalCard profile={profile} />
        <TvaCard profile={profile} />
        <BankCard profile={profile} />
        <BillingPrefsCard profile={profile} />
        <RemindersCard planType={profile.planType} initial={profile.reminders} />
        <AppearanceCard />
        <AccountCard email={profile.email} />
      </div>
    </div>
  );
}
