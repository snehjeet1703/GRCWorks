import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  frameworkId: z.string().uuid().nullable().optional(),
}).strict();

async function findBadge(id: string, organizationId: string) {
  const badge = await prisma.trustComplianceBadge.findFirst({
    where: { id, config: { organizationId } },
  });
  if (!badge) throw new HttpError(404, "Badge not found");
  return badge;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findBadge(id, user.organizationId);
    const data = await parseBody(req, updateSchema);

    const before = snapshotEntity(existing, ["name", "description", "iconUrl", "enabled", "sortOrder", "frameworkId"]);
    const updated = await prisma.trustComplianceBadge.update({ where: { id }, data });
    const after = snapshotEntity(updated, ["name", "description", "iconUrl", "enabled", "sortOrder", "frameworkId"]);

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustComplianceBadge", entityId: id, action: "UPDATE",
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
    const existing = await findBadge(id, user.organizationId);

    await prisma.trustComplianceBadge.delete({ where: { id } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustComplianceBadge", entityId: id, action: "DELETE",
      beforeJson: existing,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
