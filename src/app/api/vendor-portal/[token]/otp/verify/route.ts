import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { OTP_MAX_ATTEMPTS, loadPortalResponse, setPortalSession } from "@/lib/vendor-portal";

const schema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = limitOrNull(`vp-otp-verify-ip:${clientIp(req.headers)}`, 20, 15 * 60 * 1000);
    if (limited) return limited;

    const { token } = await params;
    const { code } = await parseBody(req, schema);
    const r = await loadPortalResponse(token);
    if (!r) throw new HttpError(404, "This link is invalid or has expired");

    if (!r.otpHash || !r.otpExpiresAt || r.otpExpiresAt < new Date()) {
      throw new HttpError(400, "This code has expired. Request a new one.");
    }
    // Attempts are capped per code, so guessing requires requesting new codes (itself rate-limited).
    if (r.otpAttempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpError(429, "Too many incorrect attempts. Request a new code.");
    }

    if (!(await compare(code, r.otpHash))) {
      await prisma.questionnaireResponse.update({ where: { id: r.id }, data: { otpAttempts: { increment: 1 } } });
      throw new HttpError(400, "Incorrect code");
    }

    await prisma.questionnaireResponse.update({
      where: { id: r.id },
      data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    await logAudit({
      organizationId: r.questionnaire.organizationId,
      userId: null,
      userName: r.contactEmail,
      entityType: "QuestionnaireResponse",
      entityId: r.id,
      entityName: `${r.questionnaire.title} → ${r.vendor.name}`,
      action: "LOGIN",
      metadataJson: { event: "vendor_portal_verified", ip: clientIp(req.headers) },
    });

    const res = NextResponse.json({ verified: true });
    setPortalSession(res, r.id);
    return res;
  } catch (err) {
    return handleError(err);
  }
}
