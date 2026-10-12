import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { TRUST_OTP_MAX_ATTEMPTS, findActiveGrant } from "@/lib/trust-sign-in";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
}).strict();

const INVALID = "That code is incorrect or has expired. Request a new one.";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const limited = limitOrNull(`trust-otp-verify-ip:${clientIp(req.headers)}`, 20, 15 * 60 * 1000);
    if (limited) return limited;

    const { slug } = await params;
    const { email, code } = await parseBody(req, schema);

    const grant = await findActiveGrant(slug, email);
    if (!grant?.otpHash || !grant.otpExpiresAt || grant.otpExpiresAt < new Date()) {
      throw new HttpError(400, INVALID);
    }
    // Attempts are capped per code, so guessing requires requesting new codes (itself rate-limited).
    if (grant.otpAttempts >= TRUST_OTP_MAX_ATTEMPTS) {
      throw new HttpError(429, "Too many incorrect attempts. Request a new code.");
    }
    if (!(await compare(code, grant.otpHash))) {
      await prisma.trustAccessRequest.update({ where: { id: grant.id }, data: { otpAttempts: { increment: 1 } } });
      throw new HttpError(400, INVALID);
    }

    // Issue a fresh token; expiry and document grants stay exactly as the admin approved them.
    const token = generateTrustToken();
    await prisma.trustAccessRequest.update({
      where: { id: grant.id },
      data: { accessTokenHash: hashTrustToken(token), otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
    });

    await logAudit({
      organizationId: grant.organizationId,
      userId: null,
      userName: grant.email,
      entityType: "TrustAccessRequest",
      entityId: grant.id,
      action: "LOGIN",
      metadataJson: { event: "trust_vault_otp_sign_in", ip: clientIp(req.headers) },
    });

    return NextResponse.json({ token });
  } catch (err) {
    return handleError(err);
  }
}
