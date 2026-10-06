import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.AUDIT_READ);
    const url = req.nextUrl;
    const entityTypes = url.searchParams.getAll("entityType");
    const entityId = url.searchParams.get("entityId");
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: user.organizationId,
        ...(entityTypes.length > 0 ? { entityType: { in: entityTypes } } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        userName: true,
        action: true,
        entityType: true,
        entityId: true,
        entityName: true,
        changes: true,
        beforeJson: true,
        afterJson: true,
      },
    });

    return NextResponse.json(logs);
  } catch (err) {
    return handleError(err);
  }
}
