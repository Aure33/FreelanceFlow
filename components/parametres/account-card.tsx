import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { CARD_BODY, CARD_HEAD, CARD_TITLE } from "./shared";

// Section « Compte » — zone danger (juste la déconnexion réelle, pas de
// suppression de compte : absente de la maquette elle-même).
export function AccountCard({ email }: { email: string }) {
  return (
    <section className="rounded-lg border border-danger-line bg-surface shadow-sm" id="compte">
      <div className={CARD_HEAD}>
        <h2 className={`${CARD_TITLE} text-danger-ink`}>Compte</h2>
      </div>
      <div className={CARD_BODY}>
        <div className="flex items-center gap-3.5">
          <div className="flex-1">
            <b className="block text-sm font-semibold">Se déconnecter</b>
            <small className="text-[13px] text-ink-3">
              {email} · connecté(e) depuis ce navigateur
            </small>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="default"
              className="border-danger-line text-danger-ink hover:bg-danger-soft"
            >
              <LogOut strokeWidth={2} />
              Déconnexion
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
