import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_APPROVE);
    const { id } = await params;
    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.policy.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Policy not found");
      if (before.status === "APPROVED") {
        throw new HttpError(400, "Policy is already approved");
      }

      const lastEdit = await tx.auditLog.findFirst({
        where: {
          entityType: "Policy",
          entityId: id,
          action: { in: ["CREATE", "UPDATE"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (lastEdit && lastEdit.userId === user.id) {
        throw new HttpError(
          403,
          "Separation of duties: you cannot approve a policy you created or last edited"
        );
      }

      const updated = await tx.policy.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: user.id,
          approvedAt: new Date(),
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Policy",
          entityId: id,
          entityName: before.title,
          action: "UPDATE",
          changes: { status: { from: before.status, to: "APPROVED" }, approvedBy: user.name },
        },
        tx
      );
      return updated;
    });
    return NextResponse.json(after);
  } catch (err) {
    return handleError(err);
  }
}
