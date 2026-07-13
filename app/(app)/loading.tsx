// État de chargement instantané du groupe (app) — issue #56.
//
// Sans ce fichier, le router App Router n'a RIEN à afficher pendant le rendu
// serveur d'une page dynamique : le clic sur un menu reste sans effet visible
// jusqu'à la réponse complète (requêtes Prisma incluses) — ressenti « figé »
// de plusieurs secondes à la première visite. Avec lui, Next préfetch ce
// squelette pour les liens visibles (la sidebar l'est toujours) et l'affiche
// dès le clic ; les données streament ensuite à leur arrivée.
//
// Squelette volontairement générique (en-tête de page + rangée de cartes +
// grand bloc de contenu) : il précède toutes les sections sans en imiter
// aucune. Tokens uniquement, aucun texte réel (pas de fausse donnée).
// A11y : role="status" annonce le chargement, blocs décoratifs aria-hidden,
// pulsation coupée si prefers-reduced-motion (motion-reduce + règle globale).

function Bloc({ className }: { className: string }) {
  return <div className={`rounded-md bg-surface-2 ${className}`} />;
}

export default function AppLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement de la page"
      className="animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Chargement de la page…</span>

      {/* En-tête de page (titre + sous-titre / action) */}
      <div aria-hidden className="mb-[22px] flex items-center gap-[18px]">
        <div>
          <Bloc className="h-7 w-44" />
          <Bloc className="mt-2 h-4 w-28" />
        </div>
        <Bloc className="ml-auto h-10 w-36 rounded-md" />
      </div>

      {/* Rangée de cartes (KPI / synthèse) */}
      <div aria-hidden className="mb-gap grid grid-cols-4 gap-gap max-[1100px]:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface px-5 py-4 shadow-sm"
          >
            <Bloc className="h-3.5 w-24" />
            <Bloc className="mt-3 h-6 w-20" />
            <Bloc className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Grand bloc de contenu (table / graphique / formulaire) */}
      <div
        aria-hidden
        className="rounded-lg border border-line bg-surface p-pad shadow-sm"
      >
        <Bloc className="h-5 w-36" />
        <div className="mt-5 flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Bloc key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
