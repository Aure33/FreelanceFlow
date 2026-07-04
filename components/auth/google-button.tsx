"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Logo Google (couleurs de marque figées : ce n'est pas un token de thème).
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.88-3a7.2 7.2 0 0 1-10.75-3.78H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.75z"
      />
    </svg>
  );
}

// Connexion Google (OAuth Supabase, flux PKCE) : redirige vers Google puis
// revient sur /auth/callback qui échange le code contre une session.
export function GoogleButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // En cas de succès, le navigateur part vers Google : on ne revient pas ici.
    // On ne relâche `loading` que si la redirection a échoué.
    if (error) setLoading(false);
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <Button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="h-[44px] w-full justify-center font-semibold"
      >
        <GoogleIcon />
        {loading ? "Redirection…" : label}
      </Button>
    </div>
  );
}
