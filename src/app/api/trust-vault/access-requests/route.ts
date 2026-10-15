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

    // reviewedBy holds a user id; resolve it so the page can say who decided.
    const reviewerIds = [...new Set(requests.map((r) => r.reviewedBy).filter((id): id is string => !!id))];
    const reviewers = reviewerIds.length
      ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(reviewers.map((u) => [u.id, u.name]));

    return NextResponse.json(
      requests.map(({ accessTokenHash, ...r }) => ({
        ...r,
        linkIssued: !!accessTokenHash,
        reviewedByName: r.reviewedBy ? nameOf.get(r.reviewedBy) ?? "a former user" : null,
      }))
    );
  } catch (err) {
    return handleError(err);
  }
}
