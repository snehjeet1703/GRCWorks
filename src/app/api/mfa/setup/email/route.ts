import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatePendingEnrolment } from "@/lib/mfa-session";
import { generateEmailOtp, generateRecoveryCodes, hashRecoveryCodes } from "@/lib/mfa";
import { sendOtpEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { hash, compare } from "bcryptjs";
import { z } from "zod";
import { limitOrNull } from "@/lib/rate-limit";

const verifySchema = z.object({ code: z.string().length(6) });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pendingGate = await gatePendingEnrolment(session.user as any);
    if (pendingGate) return pendingGate;

    const body = await req.json().catch(() => ({}));

    if (body.code) {
      const { code } = verifySchema.parse(body);
      const challenge = await prisma.mfaChallenge.findFirst({
        where: {
          userId: session.user.id,
          type: "EMAIL_OTP",
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge?.code) {
        return NextResponse.json({ error: "No pending challenge" }, { status: 400 });
      }
      if (!(await compare(code, challenge.code))) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
      }

      await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { used: true } });

      const plainCodes = generateRecoveryCodes();
      const hashedCodes = await hashRecoveryCodes(plainCodes);

      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          mfaEnabled: true, mfaMethod: "EMAIL_OTP", recoveryCodes: hashedCodes,
          ...((session.user as any).mfaPending ? { mfaVerifiedAt: new Date() } : {}),
        },
      });

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true, name: true },
      });
      await logAudit({
        organizationId: user!.organizationId,
        userId: session.user.id,
        userName: user!.name,
        entityType: "MFA",
        entityId: session.user.id,
        action: "CREATE",
        afterJson: { method: "EMAIL_OTP" },
      });

      return NextResponse.json({ success: true, recoveryCodes: plainCodes });
    }

    const limited = limitOrNull(`mfa-email:${session.user.id}`, 3, 10 * 60 * 1000);
    if (limited) return limited;

    const otp = generateEmailOtp();
    const hashedOtp = await hash(otp, 10);

    await prisma.mfaChallenge.create({
      data: {
        userId: session.user.id,
        type: "EMAIL_OTP",
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await sendOtpEmail(session.user.email, otp);

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[mfa/setup/email] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
