import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(1000),
  type: z.enum(["TEXT", "YES_NO", "SINGLE_CHOICE", "MULTI_CHOICE", "RATING", "FILE_UPLOAD"]),
  required: z.boolean().optional().default(true),
  options: z.array(z.string()).optional().default([]),
  category: z.string().max(200).optional().default(""),
});

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  questions: z.array(questionSchema).min(1).optional(),
}).strict();

async function findQuestionnaire(id: string, orgId: string) {
  const q = await prisma.vendorQuestionnaire.findUnique({ where: { id } });
  if (!q || q.organizationId !== orgId) throw new HttpError(404, "Questionnaire not found");
  return q;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ qid: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { qid } = await params;
    const q = await prisma.vendorQuestionnaire.findUnique({
      where: { id: qid },
      include: {
        responses: {
          include: { vendor: { select: { id: true, name: true, category: true } } },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!q || q.organizationId !== user.organizationId) throw new HttpError(404, "Questionnaire not found");
    return NextResponse.json(q);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qid: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { qid } = await params;
    const data = await parseBody(req, patchSchema);
    const SNAP_KEYS = ["title", "description", "category", "status"];
    const q = await prisma.$transaction(async (tx) => {
      const before = await findQuestionnaire(qid, user.organizationId);
      const updated = await tx.vendorQuestionnaire.update({
        where: { id: qid },
        data: {
          ...data,
          questions: data.questions as any,
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendorquestionnaire",
        entityId: qid,
        entityName: updated.title,
        action: "UPDATE",
        beforeJson: snapshotEntity(before as any, SNAP_KEYS),
        afterJson: snapshotEntity(updated as any, SNAP_KEYS),
      }, tx);
      return updated;
    });
    return NextResponse.json(q);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ qid: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { qid } = await params;
    await prisma.$transaction(async (tx) => {
      const existing = await findQuestionnaire(qid, user.organizationId);
      await tx.vendorQuestionnaire.delete({ where: { id: qid } });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "vendorquestionnaire",
        entityId: qid,
        entityName: existing.title,
        action: "DELETE",
      }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
