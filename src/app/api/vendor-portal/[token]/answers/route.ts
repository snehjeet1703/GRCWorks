import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { parseQuestions, requireEditable, requirePortalSession, sanitizeAnswers } from "@/lib/vendor-portal";

// Draft autosave. Partial answers are fine; required-ness is enforced on submit.
export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const r = await requirePortalSession(token);
    const limited = limitOrNull(`vp-save:${r.id}`, 120, 60_000);
    if (limited) return limited;
    requireEditable(r);

    const body = await req.json().catch(() => {
      throw new HttpError(400, "Invalid JSON body");
    });
    const answers = sanitizeAnswers(parseQuestions(r.questionnaire.questions), body?.answers);

    const updated = await prisma.questionnaireResponse.update({
      where: { id: r.id },
      data: { answers: answers as any, status: "IN_PROGRESS" },
      select: { updatedAt: true },
    });
    return NextResponse.json({ saved: true, savedAt: updated.updatedAt });
  } catch (err) {
    return handleError(err);
  }
}
