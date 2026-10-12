import { NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, parseBody } from "@/lib/api";
import { sendTrustOtpEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { TRUST_OTP_TTL_MS, findActiveGrant } from "@/lib/trust-sign-in";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();

// Emails a sign-in code to a customer whose access is still active. The reply is the same
// whether or not the email has access, so the endpoint can't be used to probe who does.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ipLimited = limitOrNull(`trust-otp-send-ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
    if (ipLimited) return ipLimited;

    const { slug } = await params;
    const { email } = await parseBody(req, schema);

    // Stops the form being used to flood someone's inbox.
    const emailLimited = limitOrNull(`trust-otp-send:${slug}:${email}`, 3, 10 * 60 * 1000);
    if (emailLimited) return emailLimited;

    const grant = await findActiveGrant(slug, email);
    if (grant) {
      const code = randomInt(100000, 1000000).toString();
      await prisma.trustAccessRequest.update({
        where: { id: grant.id },
        data: { otpHash: await hash(code, 10), otpExpiresAt: new Date(Date.now() + TRUST_OTP_TTL_MS), otpAttempts: 0 },
      });
      try {
        await sendTrustOtpEmail(grant.email, code, grant.organizationName);
      } catch (err) {
        console.error("[trust/sign-in] email failed:", err);
      }
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    return handleError(err);
  }
}
