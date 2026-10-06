import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_READ);
    const { id } = await params;
    const policy = await prisma.policy.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, version: true, title: true, content: true, status: true, approverId: true, approvedAt: true, createdAt: true },
    });
    if (!policy) throw new HttpError(404, "Policy not found");

    const historicalVersions = await prisma.policyVersion.findMany({
      where: { policyId: id },
      orderBy: { createdAt: "desc" },
    });

    const current = {
      version: policy.version,
      title: policy.title,
      content: policy.content,
      status: policy.status,
      approverId: policy.approverId,
      approvedAt: policy.approvedAt,
      createdAt: policy.createdAt,
      isCurrent: true,
    };

    return NextResponse.json([current, ...historicalVersions.map((v) => ({ ...v, isCurrent: false }))]);
  } catch (err) {
    return handleError(err);
  }
}
