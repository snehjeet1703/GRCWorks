import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateEmailOtp } from "@/lib/mfa";
import { sendOtpEmail } from "@/lib/email";
import { hash } from "bcryptjs";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    console.error("[mfa/verify/email-send] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
