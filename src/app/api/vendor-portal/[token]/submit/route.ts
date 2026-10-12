import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import {
  missingRequired, parseQuestions, requireEditable, requirePortalSession, sanitizeAnswers,
} from "@/lib/vendor-portal";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const r = await requirePortalSession(token);
    const limited = limitOrNull(`vp-submit:${r.id}`, 10, 60_000);
    if (limited) return limited;
    requireEditable(r);

    const body = await req.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body");
    });
    const questions = parseQuestions(r.questionnaire.questions);
    const answers = sanitizeAnswers(questions, body?.answers);
    const missing = missingRequired(questions, answers, new Set(r.files.map((f) => f.questionId)));
    if (missing.length > 0) {
      throw new HttpError(400, `Please answer all required questions (${missing.length} remaining)`, {
        missingQuestionIds: missing.map((q) => q.id),
      });
    }

    await prisma.questionnaireResponse.update({
      where: { id: r.id },
      data: { answers: answers as any, status: "SUBMITTED", submittedAt: new Date() },
    });
    await logAudit({
      organizationId: r.questionnaire.organizationId,
      userId: null,
      userName: r.contactEmail,
      entityType: "QuestionnaireResponse",
      entityId: r.id,
      entityName: `${r.questionnaire.title} → ${r.vendor.name}`,
      action: "UPDATE",
      metadataJson: { event: "vendor_submitted", ip: clientIp(req.headers), files: r.files.length },
    });

    return NextResponse.json({ submitted: true });
  } catch (err) {
    return handleError(err);
  }
}
