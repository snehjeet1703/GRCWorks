import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  purpose: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  website: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).strict();

async function findItem(id: string, organizationId: string) {
  const item = await prisma.trustSubprocessor.findFirst({
    where: { id, config: { organizationId } },
  });
  if (!item) throw new HttpError(404, "Sub-processor not found");
  return item;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findItem(id, user.organizationId);
    const data = await parseBody(req, updateSchema);

    const keys = ["name", "purpose", "location", "website", "enabled", "sortOrder"] as const;
    const before = snapshotEntity(existing, [...keys]);
    const updated = await prisma.trustSubprocessor.update({ where: { id }, data });
    const after = snapshotEntity(updated, [...keys]);

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustSubprocessor", entityId: id, action: "UPDATE",
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

    await prisma.trustSubprocessor.delete({ where: { id } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustSubprocessor", entityId: id, action: "DELETE",
      beforeJson: existing,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
