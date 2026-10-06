import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  action: z.string().min(1).max(500),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).optional().default(""),
});

const updateSchema = z.object({
  action: z.string().min(1).max(500).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  notes: z.string().max(2000).optional(),
  actionId: z.string().uuid(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_READ);
    const { id } = await params;

    const risk = await prisma.risk.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!risk) throw new HttpError(404, "Risk not found");

    const actions = await prisma.riskAction.findMany({
      where: { riskId: id },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(actions);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, createSchema);

    const riskAction = await prisma.$transaction(async (tx) => {
      const risk = await tx.risk.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!risk) throw new HttpError(404, "Risk not found");

      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      const created = await tx.riskAction.create({
        data: {
          riskId: id,
          action: data.action,
          ownerId: data.ownerId ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "RiskAction",
          entityId: created.id,
          entityName: `Action for ${risk.title}`,
          action: "CREATE",
          changes: { action: data.action },
        },
        tx
      );

      return created;
    });

    return NextResponse.json(riskAction, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_WRITE);
    const { id } = await params;
    const { actionId, ...data } = await parseBody(req, updateSchema);

    const updated = await prisma.$transaction(async (tx) => {
      const risk = await tx.risk.findFirst({
        where: { id, organizationId: user.organizationId },
        select: { id: true, title: true },
      });
      if (!risk) throw new HttpError(404, "Risk not found");

      const existing = await tx.riskAction.findFirst({
        where: { id: actionId, riskId: id },
      });
      if (!existing) throw new HttpError(404, "Action not found");

      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      const result = await tx.riskAction.update({
        where: { id: actionId },
        data: {
          ...data,
          dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
          completedAt: data.status === "COMPLETED" ? new Date() : undefined,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "RiskAction",
          entityId: actionId,
          entityName: `Action for ${risk.title}`,
          action: "UPDATE",
          changes: data,
        },
        tx
      );

      return result;
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
