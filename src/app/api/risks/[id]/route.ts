import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  treatment: z.enum(["ACCEPT", "MITIGATE", "TRANSFER", "AVOID"]).optional(),
  treatmentPlan: z.string().max(2000).optional(),
  status: z.enum(["OPEN", "IN_TREATMENT", "ACCEPTED", "CLOSED"]).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  controlIds: z.array(z.string().uuid()).optional(),
  residualScore: z.number().int().min(0).optional(),
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
      include: {
        owner: { select: { id: true, name: true } },
        controls: {
          include: {
            control: {
              select: {
                id: true, code: true, title: true, status: true,
                tests: { orderBy: [{ testDate: "desc" as const }, { createdAt: "desc" as const }], take: 1, select: { result: true, testDate: true } },
                _count: { select: { findings: true } },
              },
            },
          },
        },
        actions: {
          include: { owner: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        findings: {
          select: { id: true, title: true, severity: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!risk) throw new HttpError(404, "Risk not found");
    return NextResponse.json(risk);
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
    const { controlIds, ...data } = await parseBody(req, updateSchema);
    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.risk.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { controls: { select: { controlId: true } } },
      });
      if (!before) throw new HttpError(404, "Risk not found");

      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      if (controlIds !== undefined) {
        if (controlIds.length > 0) {
          const owned = await tx.control.count({
            where: { id: { in: controlIds }, organizationId: user.organizationId },
          });
          if (owned !== controlIds.length) {
            throw new HttpError(400, "One or more controls do not belong to this organization");
          }
        }
        const currentIds = new Set(before.controls.map((c) => c.controlId));
        const nextIds = new Set(controlIds);
        const toRemove = [...currentIds].filter((x) => !nextIds.has(x));
        const toAdd = [...nextIds].filter((x) => !currentIds.has(x));
        if (toRemove.length > 0) {
          await tx.riskControl.deleteMany({
            where: { riskId: id, controlId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.riskControl.createMany({
            data: toAdd.map((controlId) => ({ riskId: id, controlId })),
          });
        }
      }

      const newLikelihood = data.likelihood ?? before.likelihood;
      const newImpact = data.impact ?? before.impact;
      const inherentScore = newLikelihood * newImpact;

      const updated = await tx.risk.update({
        where: { id },
        data: {
          ...data,
          inherentScore,
          residualScore: data.residualScore,
        },
      });

      const changes = diffChanges(
        {
          title: before.title, description: before.description, category: before.category,
          likelihood: before.likelihood, impact: before.impact, inherentScore: before.inherentScore,
          treatment: before.treatment, treatmentPlan: before.treatmentPlan, ownerId: before.ownerId,
          residualScore: before.residualScore, status: before.status,
        },
        {
          title: updated.title, description: updated.description, category: updated.category,
          likelihood: updated.likelihood, impact: updated.impact, inherentScore: updated.inherentScore,
          treatment: updated.treatment, treatmentPlan: updated.treatmentPlan, ownerId: updated.ownerId,
          residualScore: updated.residualScore, status: updated.status,
        }
      );
      if (controlIds !== undefined) {
        const prevCount = before.controls.length;
        const nextCount = controlIds.length;
        if (prevCount !== nextCount) {
          changes.controlCount = { from: prevCount, to: nextCount };
        }
      }
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Risk",
            entityId: id,
            entityName: updated.title,
            action: "UPDATE",
            changes,
          },
          tx
        );
      }
      return updated;
    });
    return NextResponse.json(after);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.RISKS_WRITE);
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const before = await tx.risk.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Risk not found");
      await tx.risk.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Risk",
          entityId: id,
          entityName: before.title,
          action: "DELETE",
          changes: { title: before.title },
        },
        tx
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
