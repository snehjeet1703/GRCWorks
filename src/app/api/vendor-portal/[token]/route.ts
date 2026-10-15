import { NextResponse } from "next/server";
import { handleError, HttpError } from "@/lib/api";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { orgLogoVersion } from "@/lib/org-logo";
import { hasPortalSession, loadPortalResponse, maskEmail, parseQuestions } from "@/lib/vendor-portal";

// Before email verification only the invite's context is revealed, never questions or answers.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = limitOrNull(`vp-get:${clientIp(req.headers)}`, 60, 60_000);
    if (limited) return limited;

    const { token } = await params;
    const r = await loadPortalResponse(token);
    if (!r) throw new HttpError(404, "This link is invalid or has expired");

    const base = {
      organizationName: r.questionnaire.organization.name,
      vendorName: r.vendor.name,
      title: r.questionnaire.title,
      maskedEmail: maskEmail(r.contactEmail),
      status: r.status,
      expiresAt: r.inviteExpiresAt,
      logoVersion: await orgLogoVersion(r.questionnaire.organizationId),
    };
    if (!(await hasPortalSession(r.id))) return NextResponse.json({ ...base, verified: false });

    return NextResponse.json({
      ...base,
      verified: true,
      description: r.questionnaire.description,
      questions: parseQuestions(r.questionnaire.questions),
      answers: r.answers,
      files: r.files,
      reviewNotes: r.status === "IN_PROGRESS" ? r.reviewNotes : "",
      submittedAt: r.submittedAt,
    });
  } catch (err) {
    return handleError(err);
  }
}
