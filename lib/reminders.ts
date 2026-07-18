// Relances automatiques des factures en retard (issue #84) — logique PURE,
// sans Prisma ni Resend, testable en isolation (comme lib/periods.ts).
//
// Modèle : 3 paliers de relance après l'échéance (J+first, J+second, J+final,
// valeurs whitelistées reprises des selects de la carte Paramètres #12). Une
// facture « envoyée » et échue doit avoir reçu autant de relances que de
// paliers dépassés ; le cron quotidien envoie AU PLUS une relance par jour et
// par facture (rattrapage progressif si le cron a sauté des jours, jamais de
// rafale).

import { formatEuros } from "@/lib/invoicing/money";

export const REMINDER_FIRST_CHOICES = [3, 7, 10] as const;
export const REMINDER_SECOND_CHOICES = [10, 15, 21] as const;
export const REMINDER_FINAL_CHOICES = [21, 30, 45] as const;
export const REMINDER_TONES = ["courtois", "neutre", "ferme"] as const;

export type ReminderTone = (typeof REMINDER_TONES)[number];

export type ReminderSettings = {
  firstDays: number;
  secondDays: number;
  finalDays: number;
  tone: ReminderTone;
};

const DAY_MS = 86_400_000;

// Jours ENTIERS écoulés depuis l'échéance (0 si pas encore échue).
export function daysOverdue(dueAt: Date, now: Date): number {
  const elapsed = now.getTime() - dueAt.getTime();
  return elapsed <= 0 ? 0 : Math.floor(elapsed / DAY_MS);
}

// Nombre de relances qui DEVRAIENT être parties à l'instant `now` (0..3) :
// un palier est dû dès que son offset (en jours entiers) est atteint.
export function dueReminderStage(
  dueAt: Date,
  now: Date,
  settings: Pick<ReminderSettings, "firstDays" | "secondDays" | "finalDays">,
): number {
  const overdue = daysOverdue(dueAt, now);
  const offsets = [settings.firstDays, settings.secondDays, settings.finalDays];
  return offsets.filter((o) => overdue >= o).length;
}

// Une relance doit-elle partir MAINTENANT pour cette facture ?
// - au moins un palier dépassé de plus que le nombre de relances déjà parties ;
// - idempotence quotidienne : jamais deux relances le même jour UTC (même si
//   plusieurs paliers sont en retard de rattrapage).
export function isReminderDue(input: {
  dueAt: Date;
  now: Date;
  settings: Pick<ReminderSettings, "firstDays" | "secondDays" | "finalDays">;
  reminderCount: number;
  lastReminderAt: Date | null;
}): boolean {
  const stage = dueReminderStage(input.dueAt, input.now, input.settings);
  if (input.reminderCount >= stage) return false;
  if (
    input.lastReminderAt !== null &&
    sameUtcDay(input.lastReminderAt, input.now)
  ) {
    return false;
  }
  return true;
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// --- Contenu de l'e-mail -----------------------------------------------------
//
// Textes calqués sur les aperçus EXACTS de la carte Paramètres (#12, repris de
// Profil.html), avec les vraies valeurs de la facture. Le ton « ferme » cite
// l'article L441-10 du Code de commerce (pénalités de retard), comme l'aperçu.

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function reminderEmail(input: {
  tone: ReminderTone;
  number: string;
  totalTtcCents: number;
  dueAt: Date;
  now: Date;
  emitterName: string;
}): { subject: string; html: string } {
  const { number, emitterName } = input;
  const days = daysOverdue(input.dueAt, input.now);
  const amount = formatEuros(input.totalTtcCents);
  const due = DATE_FR.format(input.dueAt);

  const bodies: Record<ReminderTone, string> = {
    courtois: `Sauf oubli de votre part, la facture <strong>${number}</strong> est arrivée à échéance le ${due}. Je me permets de vous la rappeler en toute simplicité.`,
    neutre: `La facture <strong>${number}</strong> est échue depuis ${days} jour${days > 1 ? "s" : ""}. Merci de procéder à son règlement à réception de ce message.`,
    ferme: `Malgré nos précédents échanges, la facture <strong>${number}</strong> demeure impayée. À défaut de règlement sous 8 jours, les pénalités de retard prévues à l'article L441-10 du Code de commerce seront appliquées.`,
  };

  return {
    subject: `Rappel — facture ${number}`,
    html: `
      <p>Bonjour,</p>
      <p>${bodies[input.tone]}</p>
      <p>Montant dû : <strong>${amount}</strong> TTC — échéance : ${due}.</p>
      <p>Cordialement,<br>${emitterName}</p>
    `.trim(),
  };
}
