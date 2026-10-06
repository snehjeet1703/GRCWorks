import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, diffChanges, snapshotEntity } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const SNAP_KEYS = [
  "name", "description", "website", "category", "status", "criticality",
  "contactName", "contactEmail", "contractStart", "contractEnd",
  "dataAccess", "dataTypes", "riskScore", "notes",
];

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  website: z.string().max(500).optional(),
  category: z.enum([
    "CLOUD_INFRASTRUCTURE", "SAAS", "DATA_PROCESSOR", "PROFESSIONAL_SERVICES",
    "IT_SUPPORT", "SECURITY", "HR", "FINANCE", "LEGAL", "OTHER",
  ]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDING", "UNDER_REVIEW"]).optional(),
  criticality: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().max(200).optional(),
  contractStart: z.string().datetime().nullable().optional(),
  contractEnd: z.string().datetime().nullable().optional(),
  dataAccess: z.boolean().optional(),
  dataTypes: z.string().max(1000).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
}).strict();

async function findVendor(id: string, orgId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || vendor.organizationId !== orgId) {
    throw new HttpError(404, "Vendor not found");
  }
  return vendor;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { id } = await params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        assessments: { orderBy: { assessmentDate: "desc" } },
      },
    });
    if (!vendor || vendor.organizationId !== user.organizationId) {
      throw new HttpError(404, "Vendor not found");
    }
    return NextResponse.json(vendor);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { id } = await params;
    const data = await parseBody(req, patchSchema);
    const vendor = await prisma.$transaction(async (tx) => {
      const existing = await findVendor(id, user.organizationId);
      const before = snapshotEntity(existing as any, SNAP_KEYS);
      const updateData: any = { ...data };
      if (data.contractStart !== undefined) {
        updateData.contractStart = data.contractStart ? new Date(data.contractStart) : null;
      }
      if (data.contractEnd !== undefined) {
        updateData.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
      }
      const updated = await tx.vendor.update({ where: { id }, data: updateData });
      const after = snapshotEntity(updated as any, SNAP_KEYS);
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendor",
        entityId: id,
        entityName: updated.name,
        action: "UPDATE",
        changes: diffChanges(before, after),
        beforeJson: before,
        afterJson: after,
      }, tx);
      return updated;
    });
    return NextResponse.json(vendor);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      const existing = await findVendor(id, user.organizationId);
      await tx.vendor.delete({ where: { id } });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendor",
        entityId: id,
        entityName: existing.name,
        action: "DELETE",
        beforeJson: snapshotEntity(existing as any, SNAP_KEYS),
      }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
