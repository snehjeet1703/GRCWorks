import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  frequency: z.enum(["CONTINUOUS", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "AS_NEEDED"]),
  // Only change controls still on the default "As needed", leaving ones already set by hand.
  onlyAsNeeded: z.boolean().optional().default(true),
}).strict();

// Sets how often evidence is needed for every control in the audit period's scope.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const { id } = await params;
    const { frequency, onlyAsNeeded } = await parseBody(req, schema);
    const period = await prisma.auditPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new HttpError(404, "Audit period not found");

    const where = {
      organizationId: user.organizationId,
      applicability: { not: "NOT_APPLICABLE" as const },
      mappings: { some: { requirement: { frameworkId: period.frameworkId } } },
      ...(onlyAsNeeded ? { frequency: "AS_NEEDED" as const } : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.control.updateMany({ where, data: { frequency } });
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: id, entityName: period.name, action: "UPDATE",
          changes: { bulkFrequency: { to: frequency, controls: result.count, onlyAsNeeded } },
        },
        tx
      );
      return result.count;
    });
    return NextResponse.json({ updated });
  } catch (err) {
    return handleError(err);
  }
}
