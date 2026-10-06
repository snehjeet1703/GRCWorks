import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  mfaRequired: z.boolean(),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { mfaRequired: true },
    });
    return NextResponse.json({ mfaRequired: org?.mfaRequired ?? false });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const { mfaRequired } = await parseBody(req, updateSchema);

    const before = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { mfaRequired: true },
    });

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { mfaRequired },
    });

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      entityType: "Organization",
      entityId: user.organizationId,
      action: "UPDATE",
      beforeJson: { mfaRequired: before?.mfaRequired },
      afterJson: { mfaRequired },
    });

    return NextResponse.json({ success: true, mfaRequired });
  } catch (err) {
    return handleError(err);
  }
}
