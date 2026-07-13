// Logique pure de l'écran « Premier lancement » (issue #60) — état des trois
// étapes d'onboarding d'un compte neuf. Extraite ici (aucune dépendance) pour
// être testée unitairement avec `bun test`.
//
// Règles :
//  - l'écran ne se montre QUE tant que le compte n'a émis/enregistré aucun
//    document (l'étape 3 est la sortie naturelle du parcours) ;
//  - étape 1 « SIRET + régime de TVA » : le régime a une valeur par défaut en
//    base (`reel`), c'est donc le SIRET — vide à l'inscription — qui atteste
//    que le profil émetteur a été complété ;
//  - l'étape « courante » est la première non terminée ; celles d'après sont
//    grisées (todo).

export type OnboardingCounts = {
  hasSiret: boolean;
  clientCount: number;
  documentCount: number;
};

export type OnboardingStepState = "done" | "now" | "todo";

export type OnboardingState = {
  /** L'écran d'onboarding doit-il remplacer le tableau de bord ? */
  show: boolean;
  steps: [OnboardingStepState, OnboardingStepState, OnboardingStepState];
  doneCount: number; // 0..2 quand show=true (3/3 ⇒ show=false)
  /** Largeur de la barre de progression (%) — 8 % au départ comme la maquette. */
  progressPct: number;
  /** « ~N min » restantes (1 min par étape, comme la maquette). */
  remainingMinutes: number;
};

export function computeOnboarding(counts: OnboardingCounts): OnboardingState {
  const done = [
    counts.hasSiret,
    counts.clientCount > 0,
    counts.documentCount > 0,
  ];
  const doneCount = done.filter(Boolean).length;

  let nowSeen = false;
  const steps = done.map((d) => {
    if (d) return "done";
    if (!nowSeen) {
      nowSeen = true;
      return "now";
    }
    return "todo";
  }) as OnboardingState["steps"];

  return {
    show: counts.documentCount === 0,
    steps,
    doneCount,
    // 8 % (amorce visuelle de la maquette) puis répartition du reste sur 3 pas.
    progressPct: doneCount === 0 ? 8 : Math.round(8 + doneCount * (92 / 3)),
    remainingMinutes: 3 - doneCount,
  };
}
