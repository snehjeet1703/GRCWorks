import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { installCatalogFramework, isCatalogFramework } from "@/lib/framework-catalog";

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

const addSchema = z.discriminatedUnion("type", [
  // A built-in framework from the catalogue (requirements and controls included).
  z.object({ type: z.literal("catalog"), name: z.string().min(1).max(100) }).strict(),
  // Any other framework or privacy law: requirements are added afterwards (e.g. from a control sheet).
  z.object({
    type: z.literal("custom"),
    name: z.string().trim().min(2, "Give the framework a name").max(120),
    version: z.string().trim().max(60).optional().default(""),
    description: z.string().trim().max(1000).optional().default(""),
    publisher: z.string().trim().max(120).optional().default(""),
  }).strict(),
]);

// Adds a framework to the organisation after onboarding.
export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const data = await parseBody(req, addSchema);

    const duplicate = await prisma.framework.findFirst({
      where: { organizationId: user.organizationId, name: { equals: data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new HttpError(409, `${data.name} is already one of your frameworks`);

    const result = await prisma.$transaction(async (tx) => {
      if (data.type === "catalog") {
        if (!isCatalogFramework(data.name)) throw new HttpError(400, "That isn't a built-in framework");
        const r = await installCatalogFramework(tx, user.organizationId, data.name);
        await logAudit({
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "Framework", entityId: r.framework.id, entityName: r.framework.name, action: "CREATE",
          afterJson: { source: "catalog", requirements: r.requirements, controlsCreated: r.controlsCreated, controlsReused: r.controlsReused },
        }, tx);
        return { id: r.framework.id, name: r.framework.name, ...r, framework: undefined };
      }
      const f = await tx.framework.create({
        data: { organizationId: user.organizationId, name: data.name, version: data.version, description: data.description, publisher: data.publisher },
      });
      await logAudit({
        organizationId: user.organizationId, userId: user.id, userName: user.name,
        entityType: "Framework", entityId: f.id, entityName: f.name, action: "CREATE",
        afterJson: { source: "custom", version: f.version },
      }, tx);
      return { id: f.id, name: f.name, requirements: 0, controlsCreated: 0, controlsReused: 0 };
    }, { timeout: 60_000 });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

