import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const frameworks = await prisma.framework.findMany({
      where: { organizationId: user.organizationId },
      include: {
        requirements: {
          select: {
            id: true,
            code: true,
            title: true,
            _count: { select: { controlMappings: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = frameworks.map((f) => {
      const totalReqs = f.requirements.length;
      const mappedReqs = f.requirements.filter((r) => r._count.controlMappings > 0).length;
      return {
        id: f.id,
        name: f.name,
        version: f.version,
        description: f.description,
        publisher: f.publisher,
        totalRequirements: totalReqs,
        mappedRequirements: mappedReqs,
        unmappedRequirements: totalReqs - mappedReqs,
        createdAt: f.createdAt.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
