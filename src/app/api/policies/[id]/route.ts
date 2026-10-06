import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(50000).optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "EXPIRED", "ARCHIVED"]).optional(),
  version: z.string().max(20).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  effectiveDate: z.string().datetime().nullable().optional(),
  reviewDate: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  controlIds: z.array(z.string().uuid()).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_READ);
    const { id } = await params;
    const policy = await prisma.policy.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        controls: { include: { control: { select: { id: true, code: true, title: true, status: true } } } },
        versions: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!policy) throw new HttpError(404, "Policy not found");
    return NextResponse.json(policy);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_WRITE);
    const { id } = await params;
    const { controlIds, ...data } = await parseBody(req, updateSchema);
    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.policy.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { controls: { select: { controlId: true } } },
      });
      if (!before) throw new HttpError(404, "Policy not found");

      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      if (controlIds !== undefined) {
        if (controlIds.length > 0) {
          const owned = await tx.control.count({
            where: { id: { in: controlIds }, organizationId: user.organizationId },
          });
          if (owned !== controlIds.length) {
            throw new HttpError(400, "One or more controls do not belong to this organization");
          }
        }
        const currentIds = new Set(before.controls.map((c) => c.controlId));
        const nextIds = new Set(controlIds);
        const toRemove = [...currentIds].filter((x) => !nextIds.has(x));
        const toAdd = [...nextIds].filter((x) => !currentIds.has(x));
        if (toRemove.length > 0) {
          await tx.policyControl.deleteMany({
            where: { policyId: id, controlId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.policyControl.createMany({
            data: toAdd.map((controlId) => ({ policyId: id, controlId })),
          });
        }
      }

      const updateData: Record<string, unknown> = { ...data };
      if (data.effectiveDate !== undefined) updateData.effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : null;
      if (data.reviewDate !== undefined) updateData.reviewDate = data.reviewDate ? new Date(data.reviewDate) : null;
      if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

      // Editing approved policy content → snapshot current version and create new draft
      if (data.content !== undefined && data.content !== before.content && before.status === "APPROVED") {
        await tx.policyVersion.create({
          data: {
            policyId: id,
            version: before.version,
            title: before.title,
            content: before.content,
            status: before.status,
            approverId: before.approverId,
            approvedAt: before.approvedAt,
          },
        });
        const major = parseInt(before.version) || 1;
        updateData.version = data.version ?? `${major}.1`;
        updateData.status = "DRAFT";
        updateData.approverId = null;
        updateData.approvedAt = null;
      }

      if (data.status && data.status !== "APPROVED" && before.status === "APPROVED") {
        updateData.approverId = null;
        updateData.approvedAt = null;
      }

      const updated = await tx.policy.update({ where: { id }, data: updateData });
      const changes = diffChanges(
        {
          title: before.title, content: before.content, status: before.status,
          version: before.version, ownerId: before.ownerId,
          effectiveDate: before.effectiveDate?.toISOString() ?? null,
          reviewDate: before.reviewDate?.toISOString() ?? null,
          expiresAt: before.expiresAt?.toISOString() ?? null,
        },
        {
          title: updated.title, content: updated.content, status: updated.status,
          version: updated.version, ownerId: updated.ownerId,
          effectiveDate: updated.effectiveDate?.toISOString() ?? null,
          reviewDate: updated.reviewDate?.toISOString() ?? null,
          expiresAt: updated.expiresAt?.toISOString() ?? null,
        }
      );
      if (controlIds !== undefined) {
        const prevCount = before.controls.length;
        const nextCount = controlIds.length;
        if (prevCount !== nextCount) {
          changes.controlCount = { from: prevCount, to: nextCount };
        }
      }
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Policy",
            entityId: id,
            entityName: updated.title,
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_WRITE);
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const before = await tx.policy.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Policy not found");

      if (before.status === "APPROVED") {
        throw new HttpError(400, "Approved policies cannot be deleted — archive them instead");
      }

      await tx.policy.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Policy",
          entityId: id,
          entityName: before.title,
          action: "DELETE",
          changes: { title: before.title },
        },
        tx
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
