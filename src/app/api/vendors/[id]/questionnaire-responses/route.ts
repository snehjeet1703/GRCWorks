import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const sendSchema = z.object({
  questionnaireId: z.string().uuid(),
}).strict();

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.array(z.string()), z.number(), z.boolean()]),
});

const submitSchema = z.object({
  questionnaireId: z.string().uuid(),
  answers: z.array(answerSchema),
  status: z.enum(["IN_PROGRESS", "SUBMITTED"]).optional().default("SUBMITTED"),
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
    const responses = await prisma.questionnaireResponse.findMany({
      where: { vendorId: id },
      include: {
        questionnaire: { select: { id: true, title: true, category: true, questions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(responses);
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
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "submit") {
      const data = await parseBody(req, submitSchema);
      const response = await prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.findUnique({ where: { id } });
        if (!vendor || vendor.organizationId !== user.organizationId) {
          throw new HttpError(404, "Vendor not found");
        }
        const existing = await tx.questionnaireResponse.findUnique({
          where: { questionnaireId_vendorId: { questionnaireId: data.questionnaireId, vendorId: id } },
        });
        if (!existing) throw new HttpError(404, "Questionnaire not sent to this vendor");

        const updated = await tx.questionnaireResponse.update({
          where: { id: existing.id },
          data: {
            answers: data.answers as any,
            status: data.status,
            submittedAt: data.status === "SUBMITTED" ? new Date() : null,
          },
        });
        await logAudit({
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "questionnaireresponse",
          entityId: updated.id,
          entityName: `${vendor.name} questionnaire response`,
          action: "UPDATE",
        }, tx);
        return updated;
      });
      return NextResponse.json(response);
    }

    // Default: send a questionnaire to this vendor
    const data = await parseBody(req, sendSchema);
    const response = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id } });
      if (!vendor || vendor.organizationId !== user.organizationId) {
        throw new HttpError(404, "Vendor not found");
      }
      const questionnaire = await tx.vendorQuestionnaire.findUnique({ where: { id: data.questionnaireId } });
      if (!questionnaire || questionnaire.organizationId !== user.organizationId) {
        throw new HttpError(404, "Questionnaire not found");
      }
      if (questionnaire.status !== "PUBLISHED") {
        throw new HttpError(400, "Questionnaire must be published before sending");
      }
      const existing = await tx.questionnaireResponse.findUnique({
        where: { questionnaireId_vendorId: { questionnaireId: data.questionnaireId, vendorId: id } },
      });
      if (existing) throw new HttpError(409, "Questionnaire already sent to this vendor");

      const created = await tx.questionnaireResponse.create({
        data: {
          questionnaireId: data.questionnaireId,
          vendorId: id,
          status: "NOT_STARTED",
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "questionnaireresponse",
        entityId: created.id,
        entityName: `${questionnaire.title} → ${vendor.name}`,
        action: "CREATE",
      }, tx);
      return created;
    });
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
