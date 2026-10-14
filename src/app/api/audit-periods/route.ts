import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { parsePeriodDates, periodCoverage, periodSchema } from "@/lib/audit-periods";

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const periods = await prisma.auditPeriod.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
      orderBy: { startDate: "desc" },
    });
    const list = [];
    for (const { id } of periods) {
      const cov = await periodCoverage(user.organizationId, id);
      if (cov) list.push({ ...cov.period, counts: cov.counts, controlCount: cov.controls.length });
    }
    return NextResponse.json(list);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const data = await parseBody(req, periodSchema);
    const { start, end } = parsePeriodDates(data.startDate, data.endDate);
    const framework = await prisma.framework.findFirst({
      where: { id: data.frameworkId, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!framework) throw new HttpError(404, "Framework not found");

    const period = await prisma.$transaction(async (tx) => {
      const created = await tx.auditPeriod.create({
        data: {
          organizationId: user.organizationId, frameworkId: framework.id, name: data.name,
          startDate: start, endDate: end, createdById: user.id,
        },
      });
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: created.id, entityName: created.name, action: "CREATE",
          afterJson: { name: created.name, framework: framework.name, startDate: data.startDate, endDate: data.endDate },
        },
        tx
      );
      return created;
    });
    return NextResponse.json(period, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
