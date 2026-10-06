import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity, diffChanges } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  heroTitle: z.string().max(500).optional(),
  heroDescription: z.string().max(5000).optional(),
  primaryColor: z.string().max(20).optional(),
  showCompliance: z.boolean().optional(),
  showDocuments: z.boolean().optional(),
  showControls: z.boolean().optional(),
  showSubprocessors: z.boolean().optional(),
  requireNda: z.boolean().optional(),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    let config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!config) {
      config = await prisma.trustVaultConfig.create({
        data: { organizationId: user.organizationId },
      });
    }
    return NextResponse.json(config);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const data = await parseBody(req, updateSchema);

    let existing = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!existing) {
      existing = await prisma.trustVaultConfig.create({
        data: { organizationId: user.organizationId },
      });
    }

    const before = snapshotEntity(existing, ["enabled", "heroTitle", "heroDescription", "primaryColor", "showCompliance", "showDocuments", "showControls", "showSubprocessors", "requireNda"]);
    const updated = await prisma.trustVaultConfig.update({
      where: { id: existing.id },
      data,
    });
    const after = snapshotEntity(updated, ["enabled", "heroTitle", "heroDescription", "primaryColor", "showCompliance", "showDocuments", "showControls", "showSubprocessors", "requireNda"]);

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      entityType: "TrustVaultConfig",
      entityId: updated.id,
      action: "UPDATE",
      beforeJson: before,
      afterJson: after,
      changes: diffChanges(before, after),
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
