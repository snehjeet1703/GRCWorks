import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { getTrustConfigId } from "@/lib/trust-vault";

const createSchema = z.object({
  category: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const configId = await getTrustConfigId(user.organizationId);
    const items = await prisma.trustControl.findMany({
      where: { configId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
    const configId = await getTrustConfigId(user.organizationId);

    const item = await prisma.trustControl.create({ data: { ...data, configId } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustControl", entityId: item.id, entityName: item.name, action: "CREATE",
      afterJson: item,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
