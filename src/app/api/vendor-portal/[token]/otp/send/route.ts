import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { sendVendorOtpEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { OTP_TTL_MS, loadPortalResponse, maskEmail } from "@/lib/vendor-portal";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ipLimited = limitOrNull(`vp-otp-send-ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
    if (ipLimited) return ipLimited;

    const { token } = await params;
    const r = await loadPortalResponse(token);
    if (!r) throw new HttpError(404, "This link is invalid or has expired");

    // Stops the link being used to flood the vendor's inbox.
    const limited = limitOrNull(`vp-otp-send:${r.id}`, 3, 10 * 60 * 1000);
    if (limited) return limited;

    const code = randomInt(100000, 1000000).toString();
    await prisma.questionnaireResponse.update({
      where: { id: r.id },
      data: { otpHash: await hash(code, 10), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 },
    });

    try {
      await sendVendorOtpEmail(r.contactEmail, code, r.questionnaire.organization.name);
    } catch (err) {
      console.error("[vendor-portal/otp] email failed:", err);
      throw new HttpError(502, "We couldn't send the code. Please try again later or contact the requester.");
    }

    return NextResponse.json({ sent: true, maskedEmail: maskEmail(r.contactEmail) });
  } catch (err) {
    return handleError(err);
  }
}
