import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit, snapshotEntity } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const SNAP_KEYS = [
  "code",
  "title",
  "description",
  "status",
  "frequency",
  "applicability",
  "applicabilityJustification",
  "ownerId",
];

const updateSchema = z
  .object({
    code: z.string().min(1).max(50).optional(),
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).optional(),
    status: z
      .enum(["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "NOT_APPLICABLE"])
      .optional(),
    frequency: z
      .enum([
        "CONTINUOUS",
        "DAILY",
        "WEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "ANNUALLY",
        "AS_NEEDED",
      ])
      .optional(),
    applicability: z
      .enum(["APPLICABLE", "NOT_APPLICABLE", "PARTIALLY_APPLICABLE", "INHERITED"])
      .optional(),
    applicabilityJustification: z.string().max(2000).optional(),
    ownerId: z.string().uuid().nullable().optional(),
    implementationNotes: z.string().max(4000).optional(),
  })
  .refine(
    (d) => {
      if (d.applicability === "NOT_APPLICABLE") {
        return (
          d.applicabilityJustification !== undefined &&
          d.applicabilityJustification.trim().length > 0
        );
      }
      return true;
    },
    {
      message:
        "Justification is required when applicability is Not Applicable",
      path: ["applicabilityJustification"],
    }
  );

// API responses keep `_count.evidence` (artifacts supporting the control); internally it's the link count.
function withEvidenceCount<T extends { _count: { evidenceLinks: number } }>(c: T) {
  const { evidenceLinks, ...rest } = c._count;
  return { ...c, _count: { ...rest, evidence: evidenceLinks } };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const { id } = await params;
    const control = await prisma.control.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, name: true } },
        mappings: {
          include: {
            requirement: {
              include: {
                framework: { select: { id: true, name: true, version: true } },
              },
            },
          },
        },
        _count: {
          select: {
            evidenceLinks: true,
            risks: true,
            policies: true,
            tests: true,
            mappings: true,
            findings: true,
            exceptions: true,
          },
        },
      },
    });
    if (!control) throw new HttpError(404, "Control not found");
    return NextResponse.json(withEvidenceCount(control));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);

    if (data.ownerId) {
      const ownerUser = await prisma.user.findFirst({
        where: { id: data.ownerId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!ownerUser) {
        throw new HttpError(400, "Owner does not belong to this organization");
      }
    }

    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.control.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Control not found");

      if (data.code && data.code !== before.code) {
        const dup = await tx.control.findFirst({
          where: {
            organizationId: user.organizationId,
            code: data.code,
            id: { not: id },
          },
          select: { id: true },
        });
        if (dup) throw new HttpError(409, "Control code already exists in this organization");
      }

      if (
        (data.applicability ?? before.applicability) === "NOT_APPLICABLE" &&
        !(data.applicabilityJustification ?? before.applicabilityJustification)?.trim()
      ) {
        throw new HttpError(
          400,
          "Justification is required when applicability is Not Applicable"
        );
      }

      const updated = await tx.control.update({ where: { id }, data });
      const beforeSnap = snapshotEntity(before as any, SNAP_KEYS);
      const afterSnap = snapshotEntity(updated as any, SNAP_KEYS);
      const changes = diffChanges(beforeSnap, afterSnap);
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Control",
            entityId: id,
            entityName: `${updated.code} — ${updated.title}`,
            action: "UPDATE",
            changes,
            beforeJson: beforeSnap,
            afterJson: afterSnap,
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
    const { resolved, ...user } = await requirePermission(
      PERMISSIONS.CONTROLS_WRITE
    );
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const before = await tx.control.findFirst({
        where: { id, organizationId: user.organizationId },
        include: {
          _count: {
            select: {
              evidenceLinks: true,
              mappings: true,
              risks: true,
              policies: true,
              tests: true,
              findings: true,
              exceptions: true,
            },
          },
        },
      });
      if (!before) throw new HttpError(404, "Control not found");

      const deps = before._count;
      const depList: string[] = [];
      if (deps.mappings > 0) depList.push(`${deps.mappings} framework mapping(s)`);
      if (deps.evidenceLinks > 0) depList.push(`${deps.evidenceLinks} evidence artifact(s)`);
      if (deps.tests > 0) depList.push(`${deps.tests} test record(s)`);
      if (deps.risks > 0) depList.push(`${deps.risks} linked risk(s)`);
      if (deps.policies > 0) depList.push(`${deps.policies} linked policy/ies`);
      if (deps.findings > 0) depList.push(`${deps.findings} finding(s)`);
      if (deps.exceptions > 0) depList.push(`${deps.exceptions} exception(s)`);

      if (depList.length > 0) {
        throw new HttpError(
          409,
          `Cannot delete control with dependencies: ${depList.join(", ")}. Remove these first.`
        );
      }

      await tx.control.delete({ where: { id } });
      const beforeSnap = snapshotEntity(before as any, SNAP_KEYS);
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Control",
          entityId: id,
          entityName: `${before.code} — ${before.title}`,
          action: "DELETE",
          beforeJson: beforeSnap,
          changes: { code: before.code, title: before.title },
        },
        tx
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
