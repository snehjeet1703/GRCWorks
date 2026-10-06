import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const mapping = await tx.controlMapping.findFirst({
        where: { id },
        include: {
          control: { select: { id: true, code: true, organizationId: true } },
          requirement: {
            select: {
              id: true,
              code: true,
              framework: { select: { id: true, name: true, organizationId: true } },
            },
          },
        },
      });
      if (!mapping) throw new HttpError(404, "Mapping not found");

      if (mapping.control.organizationId !== user.organizationId) {
        throw new HttpError(404, "Mapping not found");
      }

      await tx.controlMapping.delete({ where: { id } });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "ControlMapping",
          entityId: id,
          entityName: `${mapping.control.code} → ${mapping.requirement.framework.name} ${mapping.requirement.code}`,
          action: "DELETE",
          changes: {
            controlCode: mapping.control.code,
            frameworkName: mapping.requirement.framework.name,
            requirementCode: mapping.requirement.code,
          },
        },
        tx
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
