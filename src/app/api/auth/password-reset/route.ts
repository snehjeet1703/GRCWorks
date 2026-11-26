import { NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, parseBody } from "@/lib/api";
import { sendPasswordResetCodeEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict();

// Step 1 of "forgot password": emails a 6-digit code. The reply is the same whether or not the email has an
// account, so the form can't be used to find out who has one.
export async function POST(req: Request) {
  try {
    const ipLimited = limitOrNull(`pw-reset-ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
    if (ipLimited) return ipLimited;
    const { email } = await parseBody(req, schema);
    const emailLimited = limitOrNull(`pw-reset:${email}`, 3, 15 * 60 * 1000);
    if (emailLimited) return emailLimited;

    const user = await prisma.user.findUnique({ where: { email }, select: { canSignIn: true, passwordHash: true } });
    // Only people who sign in with a password; single sign-on accounts and fictional lab colleagues get nothing.
    if (user?.canSignIn && user.passwordHash) {
      const code = randomInt(100000, 1000000).toString();
      const row = { codeHash: await hash(code, 10), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS), attempts: 0 };
      await prisma.passwordReset.upsert({ where: { email }, create: { email, ...row }, update: row });
      await sendPasswordResetCodeEmail(email, code).catch((err) => console.error("[password-reset] email failed:", err));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
