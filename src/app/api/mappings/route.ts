import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  controlId: z.string().uuid(),
  frameworkRequirementId: z.string().uuid(),
  mappingType: z.enum(["IMPLEMENTS", "SUPPORTS", "PARTIAL"]).optional().default("IMPLEMENTS"),
  notes: z.string().max(2000).optional().default(""),
});

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const data = await parseBody(req, createSchema);

    const mapping = await prisma.$transaction(async (tx) => {
      // Validate control belongs to user's org
      const control = await tx.control.findFirst({
        where: { id: data.controlId, organizationId: user.organizationId },
        select: { id: true, code: true, title: true },
      });
      if (!control) throw new HttpError(404, "Control not found in your organization");

      // Validate requirement belongs to a framework in user's org
      const requirement = await tx.frameworkRequirement.findFirst({
        where: {
          id: data.frameworkRequirementId,
          framework: { organizationId: user.organizationId },
        },
        select: { id: true, code: true, title: true, framework: { select: { id: true, name: true } } },
      });
      if (!requirement) throw new HttpError(404, "Framework requirement not found in your organization");

      // Check for duplicate
      const existing = await tx.controlMapping.findFirst({
        where: {
          controlId: data.controlId,
          frameworkRequirementId: data.frameworkRequirementId,
        },
      });
      if (existing) throw new HttpError(409, "Control is already mapped to this requirement");

      const created = await tx.controlMapping.create({
        data: {
          controlId: data.controlId,
          frameworkRequirementId: data.frameworkRequirementId,
          mappingType: data.mappingType,
          notes: data.notes,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "ControlMapping",
          entityId: created.id,
          entityName: `${control.code} → ${requirement.framework.name} ${requirement.code}`,
          action: "CREATE",
          changes: {
            controlCode: control.code,
            frameworkName: requirement.framework.name,
            requirementCode: requirement.code,
          },
        },
        tx
      );

      return {
        ...created,
        control: { code: control.code, title: control.title },
        requirement: {
          code: requirement.code,
          title: requirement.title,
          frameworkName: requirement.framework.name,
        },
      };
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
