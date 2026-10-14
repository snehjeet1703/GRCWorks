import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(4000).optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED", "CLOSED"]).optional(),
  source: z.string().max(100).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  resolution: z.string().max(4000).optional(),
  controlId: z.string().uuid().nullable().optional(),
  riskId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FINDINGS_READ);
    const { id } = await params;
    const finding = await prisma.finding.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        control: { select: { id: true, code: true, title: true } },
        risk: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    if (!finding) throw new HttpError(404, "Finding not found");
    return NextResponse.json(finding);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FINDINGS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);

    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.finding.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Finding not found");

      if (before.status === "CLOSED") {
        throw new HttpError(400, "Closed findings cannot be modified");
      }

      if (
        (data.status === "RESOLVED" || data.status === "ACCEPTED" || data.status === "CLOSED") &&
        !resolved.permissions.has(PERMISSIONS.FINDINGS_CLOSE)
      ) {
        throw new HttpError(403, `Your role doesn't allow this. It needs the "Close findings" permission; ask an admin.`);
      }

      if (data.status === "RESOLVED") {
        const resolution = data.resolution || before.resolution;
        if (!resolution) {
          throw new HttpError(400, "Resolution is required when resolving a finding");
        }
      }

      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      const isClosing = data.status === "RESOLVED" || data.status === "CLOSED";
      const result = await tx.finding.update({
        where: { id },
        data: {
          ...data,
          dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
          resolvedAt: isClosing ? new Date() : undefined,
        },
      });

      const changes = diffChanges(before as any, result as any);
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Finding",
            entityId: id,
            entityName: result.title,
            action: "UPDATE",
            changes,
          },
          tx
        );
      }
      return result;
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FINDINGS_WRITE);
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const finding = await tx.finding.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!finding) throw new HttpError(404, "Finding not found");

      await tx.finding.delete({ where: { id } });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Finding",
          entityId: id,
          entityName: finding.title,
          action: "DELETE",
        },
        tx
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
