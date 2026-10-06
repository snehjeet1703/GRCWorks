import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  purpose: z.string().max(1000).optional().default(""),
  location: z.string().max(200).optional().default(""),
  website: z.string().max(500).optional().default(""),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
}).strict();

async function getConfigId(organizationId: string) {
  let config = await prisma.trustVaultConfig.findUnique({ where: { organizationId } });
  if (!config) config = await prisma.trustVaultConfig.create({ data: { organizationId } });
  return config.id;
}

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const configId = await getConfigId(user.organizationId);
    const items = await prisma.trustSubprocessor.findMany({
      where: { configId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const data = await parseBody(req, createSchema);
    const configId = await getConfigId(user.organizationId);

    const item = await prisma.trustSubprocessor.create({
      data: { ...data, configId },
    });

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustSubprocessor", entityId: item.id, action: "CREATE",
      afterJson: item,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
