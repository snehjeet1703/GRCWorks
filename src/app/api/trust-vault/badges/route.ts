import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(""),
  iconUrl: z.string().max(500).optional().default(""),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  frameworkId: z.string().uuid().nullable().optional(),
}).strict();

async function getConfigId(organizationId: string) {
  let config = await prisma.trustVaultConfig.findUnique({ where: { organizationId } });
  if (!config) {
    config = await prisma.trustVaultConfig.create({ data: { organizationId } });
  }
  return config.id;
}

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const configId = await getConfigId(user.organizationId);
    const badges = await prisma.trustComplianceBadge.findMany({
      where: { configId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(badges);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const data = await parseBody(req, createSchema);
    const configId = await getConfigId(user.organizationId);

    const badge = await prisma.trustComplianceBadge.create({
      data: { ...data, configId },
    });

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      entityType: "TrustComplianceBadge",
      entityId: badge.id,
      action: "CREATE",
      afterJson: badge,
    });

    return NextResponse.json(badge, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
