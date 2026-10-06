import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  controlId: z.string().uuid(),
  reason: z.string().min(5).max(2000),
  compensatingControl: z.string().min(1).max(2000),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  notes: z.string().max(2000).optional().default(""),
});

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EXCEPTIONS_READ);
    const exceptions = await prisma.controlException.findMany({
      where: { organizationId: user.organizationId },
      include: {
        control: { select: { id: true, code: true, title: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(exceptions);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EXCEPTIONS_REQUEST);
    const data = await parseBody(req, createSchema);

    if (new Date(data.validUntil) <= new Date(data.validFrom)) {
      throw new HttpError(400, "validUntil must be after validFrom");
    }

    const exception = await prisma.$transaction(async (tx) => {
      const control = await tx.control.findFirst({
        where: { id: data.controlId, organizationId: user.organizationId },
      });
      if (!control) throw new HttpError(400, "Control not found in this organization");

      const created = await tx.controlException.create({
        data: {
          organizationId: user.organizationId,
          controlId: data.controlId,
          requestedById: user.id,
          reason: data.reason,
          compensatingControl: data.compensatingControl,
          validFrom: new Date(data.validFrom),
          validUntil: new Date(data.validUntil),
          notes: data.notes,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "ControlException",
          entityId: created.id,
          entityName: `Exception for ${control.code}`,
          action: "CREATE",
          changes: { controlId: data.controlId, reason: data.reason, compensatingControl: data.compensatingControl },
        },
        tx
      );

      return created;
    });

    return NextResponse.json(exception, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
