// Balayage quotidien des relances (issue #84) — appelé par la route cron
// app/api/cron/relances/route.ts. Volontairement PAS "use server" : ce module
// ne doit jamais être invocable depuis le navigateur (comme lib/premium.ts) —
// il écrit pour N'IMPORTE QUEL utilisateur éligible, la protection est le
// secret CRON de la route, pas une session.
//
// Sélection = mêmes clauses que la dérivation « en retard » (#47/#69) :
// facture, status "envoye", number non nul, dueAt dépassé — PAS de nouvelle
// logique de statut. L'éligibilité fine (paliers J+N, idempotence quotidienne)
// est déléguée à la logique pure de lib/reminders.ts.
//
// ⚠️ RESEND PALIER GRATUIT (cf. #83) : sans domaine vérifié, seul l'e-mail du
// compte Resend peut recevoir un envoi — en démo, les relances vers d'autres
// adresses sont comptées en `failed` (journalisées), jamais bloquantes.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
  isReminderDue,
  reminderEmail,
  type ReminderTone,
} from "@/lib/reminders";

export type SweepSummary = {
  usersProcessed: number;
  invoicesExamined: number;
  sent: number;
  skippedNoClientEmail: number;
  failed: number;
};

export async function runReminderSweep(
  now: Date = new Date(),
): Promise<SweepSummary> {
  const summary: SweepSummary = {
    usersProcessed: 0,
    invoicesExamined: 0,
    sent: 0,
    skippedNoClientEmail: 0,
    failed: 0,
  };

  // Seuls les comptes Premium avec relances activées sont traités — la
  // fonctionnalité est vendue Premium (#10) et le réglage est opt-in.
  const users = await prisma.user.findMany({
    where: { planType: "premium", remindersEnabled: true },
    select: {
      id: true,
      name: true,
      email: true,
      reminderFirstDays: true,
      reminderSecondDays: true,
      reminderFinalDays: true,
      reminderTone: true,
    },
  });

  const resend = new Resend(process.env.RESEND_API_KEY);

  for (const user of users) {
    summary.usersProcessed += 1;
    const settings = {
      firstDays: user.reminderFirstDays,
      secondDays: user.reminderSecondDays,
      finalDays: user.reminderFinalDays,
    };

    // Bornage SQL éco : seules les factures dont le PREMIER palier est atteint
    // peuvent être éligibles — inutile de charger les échues plus récentes.
    const firstThreshold = new Date(
      now.getTime() - settings.firstDays * 86_400_000,
    );
    const invoices = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: "facture",
        status: "envoye",
        number: { not: null },
        dueAt: { lte: firstThreshold },
      },
      select: {
        id: true,
        number: true,
        totalTtcCents: true,
        dueAt: true,
        reminderCount: true,
        lastReminderAt: true,
        project: { select: { client: { select: { email: true } } } },
      },
      orderBy: { dueAt: "asc" }, // la plus en retard d'abord
      take: 50, // garde-fou : jamais de rafale démesurée dans un run
    });

    for (const invoice of invoices) {
      summary.invoicesExamined += 1;
      if (
        !invoice.dueAt ||
        !invoice.number ||
        !isReminderDue({
          dueAt: invoice.dueAt,
          now,
          settings,
          reminderCount: invoice.reminderCount,
          lastReminderAt: invoice.lastReminderAt,
        })
      ) {
        continue;
      }

      const to = invoice.project.client.email;
      if (!to) {
        summary.skippedNoClientEmail += 1;
        console.log(
          `[cron relances] facture ${invoice.number} : client sans e-mail, ignorée`,
        );
        continue;
      }

      const { subject, html } = reminderEmail({
        tone: user.reminderTone as ReminderTone,
        number: invoice.number,
        totalTtcCents: invoice.totalTtcCents,
        dueAt: invoice.dueAt,
        now,
        emitterName: user.name ?? "Freelance Flow",
      });

      const { error } = await resend.emails.send({
        from: "Freelance Flow <onboarding@resend.dev>",
        to,
        replyTo: user.email,
        subject,
        html,
      });

      if (error) {
        summary.failed += 1;
        console.log(
          `[cron relances] facture ${invoice.number} : envoi refusé (${error.message})`,
        );
        continue;
      }

      // Trace persistée SEULEMENT si l'envoi a réussi : un échec sera retenté
      // au prochain run. updateMany filtré { id, userId } par convention.
      await prisma.document.updateMany({
        where: { id: invoice.id, userId: user.id },
        data: { reminderCount: { increment: 1 }, lastReminderAt: now },
      });
      summary.sent += 1;
      console.log(`[cron relances] facture ${invoice.number} : relance envoyée`);
    }
  }

  console.log(`[cron relances] bilan ${JSON.stringify(summary)}`);
  return summary;
}
