import { describe, expect, test } from "bun:test";
import {
  daysOverdue,
  dueReminderStage,
  isReminderDue,
  reminderEmail,
  sameUtcDay,
} from "./reminders";

// Repères fixes (UTC) — indépendants de la date d'exécution.
const DUE = new Date("2026-03-01T00:00:00Z");
const day = (n: number) => new Date(DUE.getTime() + n * 86_400_000);
const SETTINGS = { firstDays: 7, secondDays: 15, finalDays: 30 };

describe("daysOverdue", () => {
  test("0 avant et au moment exact de l'échéance", () => {
    expect(daysOverdue(DUE, new Date("2026-02-20T00:00:00Z"))).toBe(0);
    expect(daysOverdue(DUE, DUE)).toBe(0);
  });

  test("jours ENTIERS écoulés (pas d'arrondi supérieur)", () => {
    expect(daysOverdue(DUE, new Date("2026-03-01T23:59:00Z"))).toBe(0);
    expect(daysOverdue(DUE, day(1))).toBe(1);
    expect(daysOverdue(DUE, day(7))).toBe(7);
  });
});

describe("dueReminderStage", () => {
  test("0 tant que le premier palier n'est pas atteint", () => {
    expect(dueReminderStage(DUE, day(6), SETTINGS)).toBe(0);
  });

  test("paliers atteints exactement à J+first / J+second / J+final", () => {
    expect(dueReminderStage(DUE, day(7), SETTINGS)).toBe(1);
    expect(dueReminderStage(DUE, day(14), SETTINGS)).toBe(1);
    expect(dueReminderStage(DUE, day(15), SETTINGS)).toBe(2);
    expect(dueReminderStage(DUE, day(29), SETTINGS)).toBe(2);
    expect(dueReminderStage(DUE, day(30), SETTINGS)).toBe(3);
    expect(dueReminderStage(DUE, day(300), SETTINGS)).toBe(3);
  });
});

describe("isReminderDue", () => {
  test("due quand un palier est dépassé et rien n'a été envoyé", () => {
    expect(
      isReminderDue({
        dueAt: DUE,
        now: day(8),
        settings: SETTINGS,
        reminderCount: 0,
        lastReminderAt: null,
      }),
    ).toBe(true);
  });

  test("pas due si autant de relances que de paliers (déjà à jour)", () => {
    expect(
      isReminderDue({
        dueAt: DUE,
        now: day(8),
        settings: SETTINGS,
        reminderCount: 1,
        lastReminderAt: day(7),
      }),
    ).toBe(false);
  });

  test("idempotence quotidienne : jamais 2 relances le même jour UTC, même en rattrapage", () => {
    // 2 paliers en retard (J+16), 1 seule relance partie AUJOURD'HUI → refus.
    expect(
      isReminderDue({
        dueAt: DUE,
        now: new Date(day(16).getTime() + 3_600_000), // même jour UTC, 1 h après
        settings: SETTINGS,
        reminderCount: 1,
        lastReminderAt: day(16),
      }),
    ).toBe(false);
    // Le LENDEMAIN, le rattrapage du 2ᵉ palier est autorisé.
    expect(
      isReminderDue({
        dueAt: DUE,
        now: day(17),
        settings: SETTINGS,
        reminderCount: 1,
        lastReminderAt: day(16),
      }),
    ).toBe(true);
  });

  test("pas due si non échue", () => {
    expect(
      isReminderDue({
        dueAt: DUE,
        now: new Date("2026-02-01T00:00:00Z"),
        settings: SETTINGS,
        reminderCount: 0,
        lastReminderAt: null,
      }),
    ).toBe(false);
  });
});

describe("sameUtcDay", () => {
  test("vrai à minuit et 23:59 du même jour UTC, faux le lendemain", () => {
    expect(
      sameUtcDay(new Date("2026-03-08T00:00:00Z"), new Date("2026-03-08T23:59:59Z")),
    ).toBe(true);
    expect(
      sameUtcDay(new Date("2026-03-08T23:59:59Z"), new Date("2026-03-09T00:00:00Z")),
    ).toBe(false);
  });
});

describe("reminderEmail", () => {
  const base = {
    number: "FAC-2026-031",
    totalTtcCents: 83_721,
    dueAt: DUE,
    now: day(7),
    emitterName: "Camille Laurent",
  };

  test("objet et corps portent le numéro, le montant TTC exact et l'échéance", () => {
    const { subject, html } = reminderEmail({ ...base, tone: "courtois" });
    expect(subject).toBe("Rappel — facture FAC-2026-031");
    expect(html).toContain("FAC-2026-031");
    expect(html).toContain("837,21");
    expect(html).toContain("1 mars 2026");
    expect(html).toContain("Camille Laurent");
  });

  test("ton neutre : nombre de jours de retard réel, accordé au pluriel", () => {
    expect(reminderEmail({ ...base, tone: "neutre" }).html).toContain(
      "échue depuis 7 jours",
    );
    expect(
      reminderEmail({ ...base, tone: "neutre", now: day(1) }).html,
    ).toContain("échue depuis 1 jour.");
  });

  test("ton ferme : cite l'article L441-10 du Code de commerce", () => {
    expect(reminderEmail({ ...base, tone: "ferme" }).html).toContain("L441-10");
  });
});
