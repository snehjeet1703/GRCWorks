import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ qid: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { qid } = await params;
    const questionnaire = await prisma.vendorQuestionnaire.findFirst({
      where: { id: qid, organizationId: user.organizationId },
      select: { id: true, title: true, questions: true },
    });
    if (!questionnaire) throw new HttpError(404, "Questionnaire not found");

    const responses = await prisma.questionnaireResponse.findMany({
      where: { questionnaireId: qid },
      include: {
        vendor: { select: { id: true, name: true } },
        files: { select: { id: true, questionId: true, fileName: true, fileSize: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const now = new Date();
    return NextResponse.json({
      questionnaire,
      responses: responses.map(({ inviteTokenHash, otpHash, otpAttempts, otpExpiresAt, ...r }) => ({
        ...r,
        linkActive: !!inviteTokenHash && !!r.inviteExpiresAt && r.inviteExpiresAt > now,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
