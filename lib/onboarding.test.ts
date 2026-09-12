import { describe, test, expect } from "bun:test";
import { computeOnboarding, STEP_COUNT, type OnboardingState } from "./onboarding";

// computeOnboarding (issues #60, #108) — logique PURE de l'écran « Premier lancement ».
// Rappel des règles testées :
//  - show        = documentCount === 0 (le premier document est la sortie du guide) ;
//  - steps[i]    = done si l'étape est faite, la PREMIÈRE non faite est "now",
//                  les suivantes "todo" — l'ordre des étapes est fixe
//                  [SIRET, 1er client, 1er projet, 1er document], PAS l'ordre
//                  d'exécution de l'utilisateur ;
//  - progressPct = 8 (amorce visuelle de la maquette) si 0 done, sinon
//                  round(8 + done × 92/4) → 31 / 54 / 77 / 100 ;
//  - remainingMinutes = 4 - doneCount (1 min par étape, comme la maquette).
// #108 : l'étape « projet » a été insérée — l'éditeur exige un projet, le guide
// menait sinon à une impasse.

const counts = (
  hasSiret: boolean,
  clientCount: number,
  projectCount: number,
  documentCount: number,
) => ({ hasSiret, clientCount, projectCount, documentCount });

describe("computeOnboarding — compte 100 % neuf", () => {
  test("aucune étape faite : show, [now,todo,todo,todo], 0/4, 8 %, ~4 min", () => {
    expect(computeOnboarding(counts(false, 0, 0, 0))).toEqual({
      show: true,
      steps: ["now", "todo", "todo", "todo"],
      doneCount: 0,
      progressPct: 8, // amorce visuelle : jamais 0 % à l'écran
      remainingMinutes: 4,
    });
  });
});

describe("computeOnboarding — progression dans l'ordre attendu", () => {
  test("SIRET seul : [done,now,todo,todo], 1/4, 31 %, ~3 min", () => {
    expect(computeOnboarding(counts(true, 0, 0, 0))).toEqual({
      show: true,
      steps: ["done", "now", "todo", "todo"],
      doneCount: 1,
      progressPct: 31,
      remainingMinutes: 3,
    });
  });

  test("SIRET + client : l'étape courante est le PROJET (#108)", () => {
    expect(computeOnboarding(counts(true, 1, 0, 0))).toEqual({
      show: true,
      steps: ["done", "done", "now", "todo"],
      doneCount: 2,
      progressPct: 54,
      remainingMinutes: 2,
    });
  });

  test("SIRET + client + projet : l'étape courante est le document", () => {
    expect(computeOnboarding(counts(true, 1, 1, 0))).toEqual({
      show: true,
      steps: ["done", "done", "done", "now"],
      doneCount: 3,
      progressPct: 77,
      remainingMinutes: 1,
    });
  });
});

describe("computeOnboarding — progression dans le désordre", () => {
  test("client SANS SIRET : l'étape 2 est done mais 'now' reste la 1ʳᵉ non faite (étape 1)", () => {
    expect(computeOnboarding(counts(false, 3, 0, 0))).toEqual({
      show: true,
      steps: ["now", "done", "todo", "todo"],
      doneCount: 1,
      progressPct: 31,
      remainingMinutes: 3,
    });
  });
});

describe("computeOnboarding — sortie du guide (documentCount > 0)", () => {
  test("tout est fait : show=false, 4 done, 100 %, 0 min", () => {
    expect(computeOnboarding(counts(true, 2, 3, 5))).toEqual({
      show: false,
      steps: ["done", "done", "done", "done"],
      doneCount: 4,
      progressPct: 100, // round(8 + 4 × 92/4) = 100 exactement
      remainingMinutes: 0,
    });
  });

  test("documentCount > 0 SANS siret : show=false quand même, steps calculés", () => {
    expect(computeOnboarding(counts(false, 1, 1, 1))).toEqual({
      show: false,
      steps: ["now", "done", "done", "done"],
      doneCount: 3,
      progressPct: 77,
      remainingMinutes: 1,
    });
  });
});

describe("computeOnboarding — invariants", () => {
  test("il y a toujours exactement 4 étapes et AU PLUS un 'now'", () => {
    expect(STEP_COUNT).toBe(4);
    // Balayage exhaustif des 16 combinaisons booléennes des 4 conditions.
    for (const hasSiret of [false, true]) {
      for (const clientCount of [0, 7]) {
        for (const projectCount of [0, 3]) {
          for (const documentCount of [0, 2]) {
            const state: OnboardingState = computeOnboarding(
              counts(hasSiret, clientCount, projectCount, documentCount),
            );
            expect(state.steps).toHaveLength(4);
            expect(
              state.steps.filter((s) => s === "now").length,
            ).toBeLessThanOrEqual(1);
            expect(state.steps.filter((s) => s === "done")).toHaveLength(
              state.doneCount,
            );
            expect(state.remainingMinutes).toBe(4 - state.doneCount);
            // La barre progresse strictement avec doneCount.
            expect([8, 31, 54, 77, 100][state.doneCount]).toBe(
              state.progressPct,
            );
            expect(state.show).toBe(documentCount === 0);
          }
        }
      }
    }
  });
});
