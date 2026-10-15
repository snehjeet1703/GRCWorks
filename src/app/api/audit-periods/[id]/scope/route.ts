import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { addToScope } from "@/lib/audit-periods";

const schema = z.object({
  // Controls mapped to the framework to bring into the period ("all" = every one not yet covered).
  add: z.union([z.literal("all"), z.array(z.string().uuid()).max(5000)]).optional(),
  remove: z.array(z.string().uuid()).max(5000).optional(),
}).strict();

// Adds controls to, or removes them from, an audit period. Removing keeps the evidence; it only leaves the audit.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const { id } = await params;
    const { add, remove } = await parseBody(req, schema);
    if (!add && !remove?.length) throw new HttpError(400, "Nothing to change");
    const period = await prisma.auditPeriod.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!period) throw new HttpError(404, "Audit period not found");

    const result = await prisma.$transaction(async (tx) => {
      const added = add
        ? await addToScope(tx, user.organizationId, id, period.frameworkId, add === "all" ? undefined : add)
        : 0;
      const removed = remove?.length
        ? (await tx.auditPeriodControl.deleteMany({
            where: { auditPeriodId: id, controlId: { in: remove }, control: { organizationId: user.organizationId } },
          })).count
        : 0;
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: id, entityName: period.name, action: "UPDATE",
          changes: { scope: { added, removed } },
        },
        tx
      );
      return { added, removed };
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
