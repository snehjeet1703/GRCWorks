import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  version: z.string().max(20).optional().default("1.0"),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "EXPIRED", "ARCHIVED"]).optional().default("DRAFT"),
  ownerId: z.string().uuid(),
  effectiveDate: z.string().datetime().nullable().optional(),
  reviewDate: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  controlIds: z.array(z.string().uuid()).optional(),
});

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_READ);
    const url = new URL(req.url);
    const search = url.searchParams.get("search");
    const status = url.searchParams.get("status");

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const policies = await prisma.policy.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        controls: { include: { control: { select: { id: true, code: true, title: true } } } },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const now = new Date();
    const enriched = policies.map((p) => {
      let dueSoonOrOverdue: string | null = null;
      const checkDate = p.reviewDate ?? p.expiresAt;
      if (checkDate && p.status !== "EXPIRED" && p.status !== "ARCHIVED") {
        const diff = (checkDate.getTime() - now.getTime()) / 86400000;
        if (diff < 0) dueSoonOrOverdue = "OVERDUE";
        else if (diff <= 30) dueSoonOrOverdue = "DUE_SOON";
      }
      return { ...p, dueSoonOrOverdue };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.POLICIES_WRITE);
    const { controlIds, ...data } = await parseBody(req, createSchema);
    const policy = await prisma.$transaction(async (tx) => {
      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }
      if (controlIds && controlIds.length > 0) {
        const owned = await tx.control.count({
          where: { id: { in: controlIds }, organizationId: user.organizationId },
        });
        if (owned !== controlIds.length) {
          throw new HttpError(400, "One or more controls do not belong to this organization");
        }
      }
      const created = await tx.policy.create({
        data: {
          title: data.title,
          content: data.content,
          version: data.version,
          status: data.status,
          ownerId: data.ownerId,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
          reviewDate: data.reviewDate ? new Date(data.reviewDate) : null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
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
          entityType: "Policy",
          entityId: created.id,
          entityName: created.title,
          action: "CREATE",
          changes: { title: created.title, status: created.status, version: created.version, controlCount: controlIds?.length ?? 0 },
        },
        tx
      );
      return created;
    });
    return NextResponse.json(policy, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
