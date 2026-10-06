import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!config) return NextResponse.json([]);

    const ndas = await prisma.trustNda.findMany({
      where: { configId: config.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(ndas);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const data = await parseBody(req, createSchema);

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!config) {
      return NextResponse.json({ error: "Trust vault not configured" }, { status: 400 });
    }

    const existing = await prisma.trustNda.findFirst({
      where: { configId: config.id, active: true },
    });
    const version = existing ? existing.version + 1 : 1;

    const nda = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.trustNda.update({ where: { id: existing.id }, data: { active: false } });
      }
      return tx.trustNda.create({
        data: { configId: config.id, title: data.title, content: data.content, version },
      });
    });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustNda", entityId: nda.id, action: "CREATE",
      afterJson: { title: nda.title, version: nda.version },
    });

    return NextResponse.json(nda, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
