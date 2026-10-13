import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { deleteUpload } from "@/lib/storage";

const patchSchema = z.object({
  status: z.enum(["VALID", "EXPIRING", "EXPIRED", "REJECTED"]).optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
}).strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_REVIEW);
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const evidence = await prisma.evidence.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!evidence) throw new HttpError(404, "Evidence not found");

    const snapKeys = ["status", "validFrom", "validUntil", "description", "notes", "reviewedById", "reviewedAt"];
    const before = snapshotEntity(evidence as unknown as Record<string, unknown>, snapKeys);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "REJECTED" || body.status === "VALID") {
        data.reviewedById = user.id;
        data.reviewedAt = new Date();
      }
    }
    if (body.validFrom !== undefined) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (body.description !== undefined) data.description = body.description;
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.evidence.update({ where: { id }, data });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Evidence",
          entityId: id,
          entityName: evidence.fileName,
          action: "UPDATE",
          changes: data,
          beforeJson: before,
          afterJson: snapshotEntity(row as unknown as Record<string, unknown>, snapKeys),
        },
        tx
      );
      return row;
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
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_DELETE);
    const { id } = await params;

    // We look up before the transaction so we can capture the storage key to delete
    // *after* the DB commit — that way a rollback never leaves the row orphaned.
    const evidence = await prisma.evidence.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { controls: { select: { control: { select: { code: true } } } } },
    });
    if (!evidence) throw new HttpError(404, "Evidence not found");

    await prisma.$transaction(async (tx) => {
      await tx.evidence.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Evidence",
          entityId: id,
          entityName: evidence.fileName,
          action: "DELETE",
          changes: { fileName: evidence.fileName, controlCodes: evidence.controls.map((l) => l.control.code) },
        },
        tx
      );
    });

    if (evidence.fileUrl.startsWith("local:")) {
      await deleteUpload(evidence.fileUrl.slice("local:".length));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
