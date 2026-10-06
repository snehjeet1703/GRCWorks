import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  status: z.enum(["DRAFT", "IN_PROGRESS", "COMPLETED", "EXPIRED"]).optional().default("DRAFT"),
  assessmentDate: z.string().datetime().optional(),
  nextReviewDate: z.string().datetime().nullable().optional(),
  securityScore: z.number().int().min(0).max(100).optional().default(0),
  complianceScore: z.number().int().min(0).max(100).optional().default(0),
  operationalScore: z.number().int().min(0).max(100).optional().default(0),
  financialScore: z.number().int().min(0).max(100).optional().default(0),
  findings: z.string().max(5000).optional().default(""),
  recommendations: z.string().max(5000).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
}).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { id } = await params;
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor || vendor.organizationId !== user.organizationId) {
      throw new HttpError(404, "Vendor not found");
    }
    const assessments = await prisma.vendorAssessment.findMany({
      where: { vendorId: id },
      orderBy: { assessmentDate: "desc" },
    });
    return NextResponse.json(assessments);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, createSchema);
    const assessment = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id } });
      if (!vendor || vendor.organizationId !== user.organizationId) {
        throw new HttpError(404, "Vendor not found");
      }
      const sec = data.securityScore ?? 0;
      const comp = data.complianceScore ?? 0;
      const ops = data.operationalScore ?? 0;
      const fin = data.financialScore ?? 0;
      const overallScore = Math.round((sec + comp + ops + fin) / 4);
      const created = await tx.vendorAssessment.create({
        data: {
          vendorId: id,
          assessorName: user.name,
          status: data.status,
          assessmentDate: data.assessmentDate ? new Date(data.assessmentDate) : new Date(),
          nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : null,
          overallScore,
          securityScore: data.securityScore,
          complianceScore: data.complianceScore,
          operationalScore: data.operationalScore,
          financialScore: data.financialScore,
          findings: data.findings,
          recommendations: data.recommendations,
          notes: data.notes,
        },
      });
      await tx.vendor.update({
        where: { id },
        data: { riskScore: overallScore },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendorassessment",
        entityId: created.id,
        entityName: `${vendor.name} assessment`,
        action: "CREATE",
        afterJson: created as any,
      }, tx);
      return created;
    });
    return NextResponse.json(assessment, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
