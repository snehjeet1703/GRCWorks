import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z
  .object({
    mfaRequired: z.boolean().optional(),
    // Closing a control needs a reviewer's approval (on by default).
    controlApprovalRequired: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.mfaRequired !== undefined || d.controlApprovalRequired !== undefined, "Nothing to update");

const policySelect = { mfaRequired: true, controlApprovalRequired: true } as const;

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: policySelect });
    return NextResponse.json({
      mfaRequired: org?.mfaRequired ?? false,
      controlApprovalRequired: org?.controlApprovalRequired ?? true,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const data = await parseBody(req, updateSchema);

    const before = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: policySelect });
    const after = await prisma.organization.update({ where: { id: user.organizationId }, data, select: policySelect });

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      entityType: "Organization",
      entityId: user.organizationId,
      action: "UPDATE",
      beforeJson: before ?? undefined,
      afterJson: after,
    });

    return NextResponse.json({ success: true, ...after });
  } catch (err) {
    return handleError(err);
  }
}
