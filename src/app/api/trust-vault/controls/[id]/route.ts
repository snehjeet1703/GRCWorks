import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  category: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strict();

async function findItem(id: string, organizationId: string) {
  const item = await prisma.trustControl.findFirst({ where: { id, config: { organizationId } } });
  if (!item) throw new HttpError(404, "Control not found");
  return item;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findItem(id, user.organizationId);
    const data = await parseBody(req, updateSchema);

    const keys = ["category", "name", "enabled", "sortOrder"] as const;
    const before = snapshotEntity(existing, [...keys]);
    const updated = await prisma.trustControl.update({ where: { id }, data });
    const after = snapshotEntity(updated, [...keys]);

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustControl", entityId: id, entityName: updated.name, action: "UPDATE",
      beforeJson: before, afterJson: after, changes: diffChanges(before, after),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findItem(id, user.organizationId);

    await prisma.trustControl.delete({ where: { id } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustControl", entityId: id, entityName: existing.name, action: "DELETE",
      beforeJson: existing,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
