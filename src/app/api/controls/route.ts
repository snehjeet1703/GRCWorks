import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { notifyControlOwner } from "@/lib/control-work";
import { portalBaseUrl } from "@/lib/vendor-portal";

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

const createSchema = z
  .object({
    code: z.string().min(1, "Code is required").max(50),
    title: z.string().min(1, "Title is required").max(300),
    description: z.string().max(2000).optional().default(""),
    status: z
      .enum(["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "NOT_APPLICABLE"])
      .optional()
      .default("NOT_STARTED"),
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
      .optional()
      .default("AS_NEEDED"),
    applicability: z
      .enum(["APPLICABLE", "NOT_APPLICABLE", "PARTIALLY_APPLICABLE", "INHERITED"])
      .optional()
      .default("APPLICABLE"),
    applicabilityJustification: z.string().max(2000).optional().default(""),
    ownerId: z.string().uuid().nullable().optional(),
    implementationNotes: z.string().max(4000).optional().default(""),
  })
  .refine(
    (d) =>
      d.applicability !== "NOT_APPLICABLE" ||
      (d.applicabilityJustification && d.applicabilityJustification.trim().length > 0),
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

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const controls = await prisma.control.findMany({
      where: { organizationId: user.organizationId },
      include: {
        owner: { select: { id: true, name: true } },
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
      orderBy: [{ code: "asc" }],
    });
    return NextResponse.json(controls.map(withEvidenceCount));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_WRITE);
    const data = await parseBody(req, createSchema);

    if (data.ownerId) {
      const ownerUser = await prisma.user.findFirst({
        where: { id: data.ownerId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!ownerUser) {
        throw new HttpError(400, "Owner does not belong to this organization");
      }
    }

    const control = await prisma.$transaction(async (tx) => {
      const existing = await tx.control.findFirst({
        where: { organizationId: user.organizationId, code: data.code },
        select: { id: true },
      });
      if (existing) {
        throw new HttpError(409, "Control code already exists in this organization");
      }

      const created = await tx.control.create({
        data: {
          ...data,
          ownerId: data.ownerId ?? undefined,
          organizationId: user.organizationId,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Control",
          entityId: created.id,
          entityName: `${created.code} — ${created.title}`,
          action: "CREATE",
          afterJson: snapshotEntity(created as any, SNAP_KEYS),
          changes: { code: created.code, title: created.title },
        },
        tx
      );
      return created;
    });
    if (control.ownerId) await notifyControlOwner(control.id, user.id, user.name, portalBaseUrl(req));

    return NextResponse.json(control, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
