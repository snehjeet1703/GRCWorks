import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!config) return NextResponse.json([]);

    const requests = await prisma.trustAccessRequest.findMany({
      where: { configId: config.id },
      include: {
        documentAccess: {
          select: { documentId: true, permission: true, document: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      requests.map(({ accessTokenHash, ...r }) => ({ ...r, linkIssued: !!accessTokenHash }))
    );
  } catch (err) {
    return handleError(err);
  }
}
