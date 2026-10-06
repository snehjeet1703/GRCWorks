import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const FREQUENCY_OFFSETS: Record<string, (d: Date) => Date> = {
  DAILY: (d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; },
  WEEKLY: (d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; },
  MONTHLY: (d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; },
  QUARTERLY: (d) => { const n = new Date(d); n.setMonth(n.getMonth() + 3); return n; },
  ANNUALLY: (d) => { const n = new Date(d); n.setFullYear(n.getFullYear() + 1); return n; },
};

export function calculateNextDueDate(testDate: Date, frequency: string): Date | null {
  const calc = FREQUENCY_OFFSETS[frequency];
  if (!calc) return null;
  return calc(testDate);
}

const createSchema = z.object({
  result: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
  testDate: z.string().datetime(),
  notes: z.string().max(4000).optional().default(""),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const { id } = await params;
    const control = await prisma.control.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, frequency: true },
    });
    if (!control) throw new HttpError(404, "Control not found");

    const tests = await prisma.controlTest.findMany({
      where: { controlId: id },
      include: { tester: { select: { id: true, name: true } } },
      orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
    });

    const latest = tests[0] ?? null;
    const now = new Date();
    let testingStatus: string = "NOT_TESTED";
    if (latest) {
      if (latest.nextDueDate && latest.nextDueDate < now) {
        testingStatus = "OVERDUE";
      } else if (latest.nextDueDate) {
        const daysUntil = (latest.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntil <= 30) {
          testingStatus = "DUE_SOON";
        } else if (latest.result === "PASS") {
          testingStatus = "ON_TRACK";
        } else if (latest.result === "FAIL") {
          testingStatus = "FAILING";
        } else {
          testingStatus = "NOT_TESTED";
        }
      } else {
        testingStatus = latest.result === "PASS" ? "ON_TRACK" : latest.result === "FAIL" ? "FAILING" : "NOT_TESTED";
      }
    }

    return NextResponse.json({
      tests,
      latestResult: latest?.result ?? null,
      nextDueDate: latest?.nextDueDate?.toISOString() ?? null,
      testingStatus,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, createSchema);

    const testDate = new Date(data.testDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (testDate >= tomorrow) {
      throw new HttpError(400, "Test date cannot be in the future");
    }

    const test = await prisma.$transaction(async (tx) => {
      const control = await tx.control.findFirst({
        where: { id, organizationId: user.organizationId },
        select: { id: true, code: true, frequency: true },
      });
      if (!control) throw new HttpError(404, "Control not found");

      const nextDueDate = calculateNextDueDate(testDate, control.frequency);

      const created = await tx.controlTest.create({
        data: {
          controlId: id,
          testerId: user.id,
          result: data.result,
          testDate,
          nextDueDate,
          notes: data.notes,
        },
        include: { tester: { select: { id: true, name: true } } },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "ControlTest",
          entityId: created.id,
          entityName: `Test for ${control.code}: ${data.result}`,
          action: "CREATE",
          changes: {
            result: data.result,
            controlCode: control.code,
            testDate: data.testDate,
            ...(nextDueDate ? { nextDueDate: nextDueDate.toISOString() } : {}),
          },
        },
        tx
      );

      return created;
    });

    return NextResponse.json(test, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
