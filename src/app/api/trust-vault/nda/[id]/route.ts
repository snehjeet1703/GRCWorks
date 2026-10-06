import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  active: z.boolean().optional(),
}).strict();

async function findNda(id: string, organizationId: string) {
  const nda = await prisma.trustNda.findFirst({
    where: { id, config: { organizationId } },
  });
  if (!nda) throw new HttpError(404, "NDA not found");
  return nda;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findNda(id, user.organizationId);
    const data = await parseBody(req, updateSchema);

    const keys = ["title", "content", "active"] as const;
    const before = snapshotEntity(existing, [...keys]);
    const updated = await prisma.trustNda.update({ where: { id }, data });
    const after = snapshotEntity(updated, [...keys]);

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustNda", entityId: id, action: "UPDATE",
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
    const existing = await findNda(id, user.organizationId);

    await prisma.trustNda.delete({ where: { id } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustNda", entityId: id, action: "DELETE",
      beforeJson: { title: existing.title, version: existing.version },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
