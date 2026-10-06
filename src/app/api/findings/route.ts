import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const VALID_SOURCES = [
  "MANUAL", "INTERNAL_AUDIT", "EXTERNAL_AUDIT", "PENTEST",
  "CONTROL_TEST", "RISK_ASSESSMENT", "VENDOR_ASSESSMENT",
  "VULNERABILITY_SCAN", "INCIDENT", "SELF_ASSESSMENT",
] as const;

const createSchema = z.object({
  controlId: z.string().uuid().nullable().optional(),
  riskId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional().default(""),
  source: z.enum(VALID_SOURCES).optional().default("MANUAL"),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  ownerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const OVERDUE_THRESHOLD = 0;
const DUE_SOON_DAYS = 7;

function computeFindingStatus(f: { status: string; dueDate: Date | null }, now: Date) {
  if (f.status !== "OPEN" && f.status !== "IN_PROGRESS") return null;
  if (!f.dueDate) return null;
  const diff = (f.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < OVERDUE_THRESHOLD) return "OVERDUE";
  if (diff <= DUE_SOON_DAYS) return "DUE_SOON";
  return null;
}

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FINDINGS_READ);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const severity = url.searchParams.get("severity");
    const source = url.searchParams.get("source");
    const controlId = url.searchParams.get("controlId");
    const search = url.searchParams.get("search");

    const where: Record<string, unknown> = { organizationId: user.organizationId };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (source) where.source = source;
    if (controlId) where.controlId = controlId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const findings = await prisma.finding.findMany({
      where,
      include: {
        control: { select: { id: true, code: true, title: true } },
        risk: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const enriched = findings.map((f) => ({
      ...f,
      dueSoonOrOverdue: computeFindingStatus(f, now),
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FINDINGS_WRITE);
    const data = await parseBody(req, createSchema);

    const finding = await prisma.$transaction(async (tx) => {
      if (data.controlId) {
        const control = await tx.control.findFirst({
          where: { id: data.controlId, organizationId: user.organizationId },
        });
        if (!control) throw new HttpError(400, "Control not found in this organization");
      }
      if (data.riskId) {
        const risk = await tx.risk.findFirst({
          where: { id: data.riskId, organizationId: user.organizationId },
        });
        if (!risk) throw new HttpError(400, "Risk not found in this organization");
      }
      if (data.ownerId) {
        const owner = await tx.user.findFirst({
          where: { id: data.ownerId, organizationId: user.organizationId },
        });
        if (!owner) throw new HttpError(400, "Owner not found in this organization");
      }

      const created = await tx.finding.create({
        data: {
          organizationId: user.organizationId,
          controlId: data.controlId ?? null,
          riskId: data.riskId ?? null,
          title: data.title,
          description: data.description,
          source: data.source,
          severity: data.severity,
          ownerId: data.ownerId ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Finding",
          entityId: created.id,
          entityName: created.title,
          action: "CREATE",
          changes: { severity: data.severity, source: data.source, controlId: data.controlId },
        },
        tx
      );

      return created;
    });

    return NextResponse.json(finding, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
