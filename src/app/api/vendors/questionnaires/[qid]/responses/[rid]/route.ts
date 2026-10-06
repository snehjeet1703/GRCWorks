import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const reviewSchema = z.object({
  reviewNotes: z.string().max(2000).optional().default(""),
  score: z.number().int().min(0).max(100).optional(),
}).strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qid: string; rid: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { qid, rid } = await params;
    const data = await parseBody(req, reviewSchema);
    const response = await prisma.$transaction(async (tx) => {
      const existing = await tx.questionnaireResponse.findUnique({
        where: { id: rid },
        include: { questionnaire: true, vendor: true },
      });
      if (!existing || existing.questionnaireId !== qid || existing.questionnaire.organizationId !== user.organizationId) {
        throw new HttpError(404, "Response not found");
      }
      if (existing.status !== "SUBMITTED") {
        throw new HttpError(400, "Response must be submitted before review");
      }
      const updated = await tx.questionnaireResponse.update({
        where: { id: rid },
        data: {
          status: "REVIEWED",
          reviewedAt: new Date(),
          reviewedBy: user.name,
          reviewNotes: data.reviewNotes,
          score: data.score,
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "questionnaireresponse",
        entityId: rid,
        entityName: `${existing.vendor.name} - ${existing.questionnaire.title}`,
        action: "UPDATE",
        afterJson: { status: "REVIEWED", score: data.score },
      }, tx);
      return updated;
    });
    return NextResponse.json(response);
  } catch (err) {
    return handleError(err);
  }
}
