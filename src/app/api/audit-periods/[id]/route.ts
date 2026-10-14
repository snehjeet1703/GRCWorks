import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { parsePeriodDates, periodCoverage, periodSchema } from "@/lib/audit-periods";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const { id } = await params;
    const cov = await periodCoverage(user.organizationId, id);
    if (!cov) throw new HttpError(404, "Audit period not found");
    return NextResponse.json(cov);
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = periodSchema.omit({ frameworkId: true });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);
    const { start, end } = parsePeriodDates(data.startDate, data.endDate);
    const before = await prisma.auditPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!before) throw new HttpError(404, "Audit period not found");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.auditPeriod.update({ where: { id }, data: { name: data.name, startDate: start, endDate: end } });
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: id, entityName: row.name, action: "UPDATE",
          beforeJson: { name: before.name, startDate: before.startDate, endDate: before.endDate },
          afterJson: { name: row.name, startDate: row.startDate, endDate: row.endDate },
        },
        tx
      );
      return row;
    });
    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

// Deleting a period removes its slot approvals; the evidence files themselves stay on their controls.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const { id } = await params;
    const period = await prisma.auditPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new HttpError(404, "Audit period not found");
    await prisma.$transaction(async (tx) => {
      await tx.auditPeriod.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: id, entityName: period.name, action: "DELETE",
          beforeJson: { name: period.name, startDate: period.startDate, endDate: period.endDate },
        },
        tx
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
