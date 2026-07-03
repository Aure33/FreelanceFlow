import { redirect } from "next/navigation";

// Provisoire : la landing publique (Accueil.html) remplacera cette page
// dans app/(public)/page.tsx. En attendant, on entre directement dans l'app.
export default function Home() {
  redirect("/dashboard");
}
