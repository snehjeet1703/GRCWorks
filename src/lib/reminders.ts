import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OWNER_ACTION, slotReviewQueue, slotWorkForOwner, type SlotWorkItem } from "@/lib/audit-periods";
import { sendEvidenceReminderEmail } from "@/lib/email";
import { PERMISSIONS, hasPermission, resolvePermissions } from "@/lib/permissions";

const DAY = 86_400_000;

// Reminders go out on the first run at or after this hour (UTC) each day.
const SEND_HOUR_UTC = Math.min(23, Math.max(0, Number(process.env.REMINDER_HOUR_UTC ?? 3) || 0));

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type ReminderRunResult = { organizations: number; sent: number; skipped: number };

/**
 * Sends evidence reminders for open audit-period slots:
 *  - daily while any of a person's open items belongs to a period in its final N days (N is configurable),
 *  - otherwise weekly on the configured weekday.
 * Safe to call repeatedly: at most one reminder per person per day (ReminderLog; its unique (user, kind, day)
 * also guards against two server instances sending the same kind at once).
 */
export async function runReminders(
  now = new Date(),
  opts: { organizationId?: string; ignoreHour?: boolean } = {}
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { organizations: 0, sent: 0, skipped: 0 };
  if (!opts.ignoreHour && now.getUTCHours() < SEND_HOUR_UTC) return result;

  const orgs = await prisma.organization.findMany({
    where: { remindersEnabled: true, ...(opts.organizationId ? { id: opts.organizationId } : {}) },
    select: { id: true, reminderWeekday: true, reminderFinalDays: true },
  });
  const baseUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");

  for (const org of orgs) {
    result.organizations++;
    const users = await prisma.user.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true, email: true, role: true, customRole: { select: { name: true, permissions: true } } },
    });

    for (const u of users) {
      const canReview = hasPermission(resolvePermissions(u), PERMISSIONS.EVIDENCE_REVIEW);
      const [owned, reviews] = await Promise.all([
        slotWorkForOwner(org.id, u.id),
        canReview ? slotReviewQueue(org.id, u.id) : Promise.resolve([] as SlotWorkItem[]),
      ]);
      const actionable = owned.filter((i) => OWNER_ACTION.includes(i.slot.status));
      if (actionable.length === 0 && reviews.length === 0) continue;

      // Final stretch: the soonest-closing period (not yet ended) within the configured window.
      const closing = [...actionable, ...reviews]
        .map((i) => ({ name: i.periodName, daysLeft: Math.floor((Date.parse(i.periodEnd) - now.getTime()) / DAY) }))
        .filter((p) => p.daysLeft >= 0 && p.daysLeft < org.reminderFinalDays)
        .sort((a, b) => a.daysLeft - b.daysLeft)[0];

      const kind = closing ? "FINAL_DAILY" : now.getUTCDay() === org.reminderWeekday ? "WEEKLY" : null;
      if (!kind) continue;

      // One reminder per person per day: a closing-period email replaces, not adds to, that day's weekly one.
      if (await prisma.reminderLog.findFirst({ where: { userId: u.id, sentOn: ymd(now) }, select: { id: true } })) {
        result.skipped++;
        continue;
      }

      try {
        await prisma.reminderLog.create({ data: { userId: u.id, kind, sentOn: ymd(now) } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          result.skipped++;
          continue; // already sent today (another run or another server instance)
        }
        throw err;
      }

      try {
        await sendEvidenceReminderEmail(u.email, {
          name: u.name,
          final: closing ? { periodName: closing.name, daysLeft: closing.daysLeft } : null,
          items: actionable
            .sort((a, b) => Date.parse(a.slot.end) - Date.parse(b.slot.end))
            .map((i) => ({
              periodName: i.periodName,
              control: `${i.control.code} ${i.control.title}`,
              slot: i.slot.label,
              status: i.slot.status,
              due: i.slot.end.slice(0, 10),
            })),
          reviewCount: reviews.length,
          link: `${baseUrl}/tasks`,
        });
        result.sent++;
      } catch (err) {
        console.error(`[reminders] email to ${u.email} failed:`, err);
      }
    }
  }
  return result;
}
