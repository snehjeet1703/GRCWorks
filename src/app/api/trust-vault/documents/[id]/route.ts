import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { deleteUpload } from "@/lib/storage";
import { VIEWABLE_MIME_TYPES } from "@/lib/trust-access";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  visibility: z.enum(["PUBLIC", "ACCESS_REQUIRED"]).optional(),
  permission: z.enum(["VIEW_ONLY", "DOWNLOADABLE"]).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  validUntil: z.string().datetime().nullable().optional(),
}).strict();

async function findDoc(id: string, organizationId: string) {
  const doc = await prisma.trustVaultDocument.findFirst({
    where: { id, config: { organizationId } },
  });
  if (!doc) throw new HttpError(404, "Document not found");
  return doc;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const existing = await findDoc(id, user.organizationId);
    const raw = await parseBody(req, updateSchema);
    if (raw.permission === "VIEW_ONLY" && !VIEWABLE_MIME_TYPES.has(existing.mimeType)) {
      throw new HttpError(400, "Only PDFs and images can be view-only. Keep this file Downloadable or re-upload it as a PDF.");
    }
    const data: any = { ...raw };
    if (raw.validUntil !== undefined) {
      data.validUntil = raw.validUntil ? new Date(raw.validUntil) : null;
    }

    const keys = ["name", "description", "category", "visibility", "permission", "enabled", "sortOrder", "validUntil"] as const;
    const before = snapshotEntity(existing, [...keys]);
    const updated = await prisma.trustVaultDocument.update({ where: { id }, data });
    const after = snapshotEntity(updated, [...keys]);

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustVaultDocument", entityId: id, action: "UPDATE",
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
    const existing = await findDoc(id, user.organizationId);

    await prisma.trustVaultDocument.delete({ where: { id } });
    await deleteUpload(existing.storageKey);

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustVaultDocument", entityId: id, action: "DELETE",
      beforeJson: { name: existing.name, fileName: existing.fileName },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
