import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  website: z.string().max(500).optional().default(""),
  category: z.enum([
    "CLOUD_INFRASTRUCTURE", "SAAS", "DATA_PROCESSOR", "PROFESSIONAL_SERVICES",
    "IT_SUPPORT", "SECURITY", "HR", "FINANCE", "LEGAL", "OTHER",
  ]).optional().default("OTHER"),
  status: z.enum(["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDING", "UNDER_REVIEW"]).optional().default("ONBOARDING"),
  criticality: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  contactName: z.string().max(200).optional().default(""),
  contactEmail: z.string().max(200).optional().default(""),
  contractStart: z.string().datetime().nullable().optional(),
  contractEnd: z.string().datetime().nullable().optional(),
  dataAccess: z.boolean().optional().default(false),
  dataTypes: z.string().max(1000).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
}).strict();

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const vendors = await prisma.vendor.findMany({
      where: { organizationId: user.organizationId },
      include: {
        assessments: {
          orderBy: { assessmentDate: "desc" },
          take: 1,
          select: { id: true, overallScore: true, status: true, assessmentDate: true },
        },
        _count: { select: { assessments: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(vendors);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const data = await parseBody(req, createSchema);
    const vendor = await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({
        data: {
          ...data,
          contractStart: data.contractStart ? new Date(data.contractStart) : null,
          contractEnd: data.contractEnd ? new Date(data.contractEnd) : null,
          organizationId: user.organizationId,
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendor",
        entityId: created.id,
        entityName: created.name,
        action: "CREATE",
        afterJson: created as any,
      }, tx);
      return created;
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
