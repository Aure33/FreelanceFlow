import { describe, test, expect } from "bun:test";
import { computeOnboarding, type OnboardingState } from "./onboarding";

// computeOnboarding (issue #60) — logique PURE de l'écran « Premier lancement ».
// Rappel des règles testées :
//  - show        = documentCount === 0 (le premier document est la sortie du guide) ;
//  - steps[i]    = done si l'étape est faite, la PREMIÈRE non faite est "now",
//                  les suivantes "todo" — l'ordre des étapes est fixe
//                  [SIRET, 1er client, 1er document], PAS l'ordre d'exécution
//                  de l'utilisateur ;
//  - progressPct = 8 (amorce visuelle de la maquette) si 0 done, sinon
//                  round(8 + done × 92/3) → 39 / 69 / 100 ;
//  - remainingMinutes = 3 - doneCount (1 min par étape, comme la maquette).

describe("computeOnboarding — compte 100 % neuf", () => {
  test("aucune étape faite : show, [now,todo,todo], 0/3, 8 %, ~3 min", () => {
    expect(
      computeOnboarding({ hasSiret: false, clientCount: 0, documentCount: 0 }),
    ).toEqual({
      show: true,
      steps: ["now", "todo", "todo"],
      doneCount: 0,
      progressPct: 8, // amorce visuelle : jamais 0 % à l'écran
      remainingMinutes: 3,
    });
  });
});

describe("computeOnboarding — progression dans l'ordre attendu", () => {
  test("SIRET seul : [done,now,todo], 1/3, 39 %, ~2 min", () => {
    // round(8 + 1 × 92/3) = round(38,67) = 39
    expect(
      computeOnboarding({ hasSiret: true, clientCount: 0, documentCount: 0 }),
    ).toEqual({
      show: true,
      steps: ["done", "now", "todo"],
      doneCount: 1,
      progressPct: 39,
      remainingMinutes: 2,
    });
  });

  test("SIRET + client : [done,done,now], 2/3, 69 %, ~1 min", () => {
    // round(8 + 2 × 92/3) = round(69,33) = 69
    expect(
      computeOnboarding({ hasSiret: true, clientCount: 1, documentCount: 0 }),
    ).toEqual({
      show: true,
      steps: ["done", "done", "now"],
      doneCount: 2,
      progressPct: 69,
      remainingMinutes: 1,
    });
  });
});

describe("computeOnboarding — progression dans le désordre", () => {
  test("client SANS SIRET : l'étape 2 est done mais 'now' reste la 1ʳᵉ non faite (étape 1)", () => {
    // C'est LE cas qui distingue « now = première NON FAITE » d'un simple
    // « now = doneCount-ième » : l'étape 2 est terminée, l'étape 3 est "todo"
    // (pas "now" : elle n'est pas la première non faite).
    expect(
      computeOnboarding({ hasSiret: false, clientCount: 3, documentCount: 0 }),
    ).toEqual({
      show: true,
      steps: ["now", "done", "todo"],
      doneCount: 1,
      progressPct: 39,
      remainingMinutes: 2,
    });
  });
});

describe("computeOnboarding — sortie du guide (documentCount > 0)", () => {
  test("tout est fait : show=false, [done,done,done], 100 %, 0 min", () => {
    expect(
      computeOnboarding({ hasSiret: true, clientCount: 2, documentCount: 5 }),
    ).toEqual({
      show: false,
      steps: ["done", "done", "done"],
      doneCount: 3,
      progressPct: 100, // round(8 + 3 × 92/3) = 100 exactement
      remainingMinutes: 0,
    });
  });

  test("documentCount > 0 SANS siret ni client : show=false quand même, steps calculés", () => {
    // Un document existe (importé, créé avant un effacement de profil…) :
    // l'écran ne se montre plus, mais l'état des étapes reste cohérent
    // (l'étape 3 est done, la 1ʳᵉ non faite est "now").
    expect(
      computeOnboarding({ hasSiret: false, clientCount: 0, documentCount: 1 }),
    ).toEqual({
      show: false,
      steps: ["now", "todo", "done"],
      doneCount: 1,
      progressPct: 39,
      remainingMinutes: 2,
    });
  });

  test("client + document sans siret : show=false, [now,done,done]", () => {
    expect(
      computeOnboarding({ hasSiret: false, clientCount: 1, documentCount: 1 }),
    ).toEqual({
      show: false,
      steps: ["now", "done", "done"],
      doneCount: 2,
      progressPct: 69,
      remainingMinutes: 1,
    });
  });
});

describe("computeOnboarding — invariants", () => {
  test("il y a toujours exactement 3 étapes et AU PLUS un 'now'", () => {
    // Balayage exhaustif des 8 combinaisons booléennes des 3 conditions.
    for (const hasSiret of [false, true]) {
      for (const clientCount of [0, 7]) {
        for (const documentCount of [0, 2]) {
          const state: OnboardingState = computeOnboarding({
            hasSiret,
            clientCount,
            documentCount,
          });
          expect(state.steps).toHaveLength(3);
          expect(
            state.steps.filter((s) => s === "now").length,
          ).toBeLessThanOrEqual(1);
          // doneCount cohérent avec les steps, minutes = 3 - done.
          expect(state.steps.filter((s) => s === "done")).toHaveLength(
            state.doneCount,
          );
          expect(state.remainingMinutes).toBe(3 - state.doneCount);
          // La barre progresse strictement avec doneCount : 8/39/69/100.
          expect([8, 39, 69, 100][state.doneCount]).toBe(state.progressPct);
        }
      }
    }
  });
});
