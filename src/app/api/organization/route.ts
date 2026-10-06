import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const data = await parseBody(req, updateSchema);
    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({
        where: { id: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Organization not found");
      const updated = await tx.organization.update({
        where: { id: user.organizationId },
        data,
      });
      const changes = diffChanges(before, updated);
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Organization",
            entityId: user.organizationId,
            entityName: updated.name,
            action: "UPDATE",
            changes,
          },
          tx
        );
      }
      return updated;
    });
    return NextResponse.json(after);
  } catch (err) {
    return handleError(err);
  }
}
