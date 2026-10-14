import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { runReminders } from "@/lib/reminders";

const select = { remindersEnabled: true, reminderWeekday: true, reminderFinalDays: true } as const;

const updateSchema = z.object({
  remindersEnabled: z.boolean(),
  reminderWeekday: z.number().int().min(0).max(6),
  reminderFinalDays: z.number().int().min(1).max(30),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select });
    return NextResponse.json({ ...org, sendHourUtc: Number(process.env.REMINDER_HOUR_UTC ?? 3) || 0 });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const data = await parseBody(req, updateSchema);
    const before = await prisma.organization.findUnique({ where: { id: user.organizationId }, select });
    const after = await prisma.organization.update({ where: { id: user.organizationId }, data, select });
    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "Organization", entityId: user.organizationId, action: "UPDATE",
      beforeJson: before ?? undefined, afterJson: after,
    });
    return NextResponse.json(after);
  } catch (err) {
    return handleError(err);
  }
}

// "Send reminders now": runs today's reminders for this organisation immediately (still at most one per person per day).
export async function POST() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const result = await runReminders(new Date(), { organizationId: user.organizationId, ignoreHour: true });
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
