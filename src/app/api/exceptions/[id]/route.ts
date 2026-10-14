import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "EXPIRED", "CLOSED"]).optional(),
  reason: z.string().min(5).max(2000).optional(),
  compensatingControl: z.string().max(2000).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EXCEPTIONS_READ);
    const { id } = await params;
    const exception = await prisma.controlException.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        control: { select: { id: true, code: true, title: true, status: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });
    if (!exception) throw new HttpError(404, "Exception not found");
    return NextResponse.json(exception);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EXCEPTIONS_REQUEST);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);

    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.controlException.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Exception not found");

      // Approval/rejection requires EXCEPTIONS_APPROVE
      if (data.status === "APPROVED" || data.status === "REJECTED") {
        if (!resolved.permissions.has(PERMISSIONS.EXCEPTIONS_APPROVE)) {
          throw new HttpError(403, `Your role doesn't allow this. It needs the "Approve exceptions" permission; ask an admin.`);
        }
        // Separation of duties: requester cannot approve their own exception
        if (before.requestedById === user.id) {
          throw new HttpError(403, "Separation of duties: you cannot approve an exception you requested");
        }
      }

      // Approved exceptions cannot be silently modified (except status transitions)
      if (before.status === "APPROVED" && !data.status) {
        throw new HttpError(400, "Approved exceptions cannot be modified without a status change");
      }
      if (before.status === "APPROVED" && data.status === "APPROVED") {
        throw new HttpError(400, "Exception is already approved");
      }

      // Closed exceptions cannot be reopened without going through REQUESTED
      if (before.status === "CLOSED" && data.status && data.status !== "CLOSED") {
        throw new HttpError(400, "Closed exceptions cannot be reopened");
      }

      // Date validation
      const newFrom = data.validFrom ? new Date(data.validFrom) : before.validFrom;
      const newUntil = data.validUntil ? new Date(data.validUntil) : before.validUntil;
      if (newUntil <= newFrom) {
        throw new HttpError(400, "validUntil must be after validFrom");
      }

      const updateData: Record<string, unknown> = { ...data };
      if (data.validFrom) updateData.validFrom = new Date(data.validFrom);
      if (data.validUntil) updateData.validUntil = new Date(data.validUntil);
      if (data.status === "APPROVED" || data.status === "REJECTED") {
        updateData.approvedById = user.id;
      }

      const result = await tx.controlException.update({
        where: { id },
        data: updateData,
      });

      const changes = diffChanges(
        {
          status: before.status, reason: before.reason,
          compensatingControl: before.compensatingControl,
          validFrom: before.validFrom.toISOString(),
          validUntil: before.validUntil.toISOString(),
          notes: before.notes,
        },
        {
          status: result.status, reason: result.reason,
          compensatingControl: result.compensatingControl,
          validFrom: result.validFrom.toISOString(),
          validUntil: result.validUntil.toISOString(),
          notes: result.notes,
        }
      );
      if (data.status === "APPROVED") changes.approvedBy = { from: null, to: user.name };
      if (data.status === "REJECTED") changes.rejectedBy = { from: null, to: user.name };

      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "ControlException",
            entityId: id,
            entityName: `Exception for control`,
            action: data.status === "APPROVED" ? "APPROVE" : data.status === "REJECTED" ? "REJECT" : "UPDATE",
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
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EXCEPTIONS_APPROVE);
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const exception = await tx.controlException.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!exception) throw new HttpError(404, "Exception not found");

      await tx.controlException.delete({ where: { id } });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "ControlException",
          entityId: id,
          entityName: `Exception for control`,
          action: "DELETE",
          changes: { reason: exception.reason },
        },
        tx
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
