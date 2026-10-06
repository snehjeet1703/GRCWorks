import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  category: z.string().max(100).optional().default(""),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  treatment: z.enum(["ACCEPT", "MITIGATE", "TRANSFER", "AVOID"]).optional().default("MITIGATE"),
  treatmentPlan: z.string().max(2000).optional().default(""),
  status: z.enum(["OPEN", "IN_TREATMENT", "ACCEPTED", "CLOSED"]).optional().default("OPEN"),
  ownerId: z.string().uuid().nullable().optional(),
  controlIds: z.array(z.string().uuid()).optional(),
  residualScore: z.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_READ);
    const url = new URL(req.url);
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const treatment = url.searchParams.get("treatment");
    const severity = url.searchParams.get("severity");
    const sort = url.searchParams.get("sort") || "highest";

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (treatment) where.treatment = treatment;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
      ];
    }
    if (severity) {
      const ranges: Record<string, [number, number]> = {
        CRITICAL: [20, 25], HIGH: [12, 19], MEDIUM: [5, 11], LOW: [1, 4],
      };
      const range = ranges[severity];
      if (range) {
        where.inherentScore = { gte: range[0], lte: range[1] };
      }
    }

    let orderBy: any;
    switch (sort) {
      case "lowest": orderBy = [{ inherentScore: "asc" }]; break;
      case "newest": orderBy = [{ createdAt: "desc" }]; break;
      case "oldest": orderBy = [{ createdAt: "asc" }]; break;
      default: orderBy = [{ inherentScore: "desc" }]; break;
    }

    const risks = await prisma.risk.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        controls: { include: { control: { select: { id: true, code: true, title: true } } } },
        _count: { select: { actions: true, findings: true } },
      },
      orderBy,
    });
    return NextResponse.json(risks);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_WRITE);
    const { controlIds, ...data } = await parseBody(req, createSchema);

    const inherentScore = data.likelihood * data.impact;

    const risk = await prisma.$transaction(async (tx) => {
      if (controlIds && controlIds.length > 0) {
        const owned = await tx.control.count({
          where: { id: { in: controlIds }, organizationId: user.organizationId },
        });
        if (owned !== controlIds.length) {
          throw new HttpError(400, "One or more controls do not belong to this organization");
        }
      }
      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      const created = await tx.risk.create({
        data: {
          ...data,
          inherentScore,
          residualScore: data.residualScore ?? inherentScore,
          organizationId: user.organizationId,
          controls: controlIds && controlIds.length > 0
            ? { create: controlIds.map((controlId) => ({ controlId })) }
            : undefined,
        },
      });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Risk",
          entityId: created.id,
          entityName: created.title,
          action: "CREATE",
          changes: { title: created.title, inherentScore, controlCount: controlIds?.length ?? 0 },
        },
        tx
      );
      return created;
    });
    return NextResponse.json(risk, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
