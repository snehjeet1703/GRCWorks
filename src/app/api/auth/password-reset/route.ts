import { NextResponse, after } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, parseBody } from "@/lib/api";
import { sendPasswordResetCodeEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict();

async function issueCode(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { canSignIn: true, passwordHash: true } });
  // Only people who sign in with a password; single sign-on accounts and fictional lab colleagues get nothing.
  if (!user?.canSignIn || !user.passwordHash) return;
  const code = randomInt(100000, 1000000).toString();
  const row = { codeHash: await hash(code, 10), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS), attempts: 0 };
  await prisma.passwordReset.upsert({ where: { email }, create: { email, ...row }, update: row });
  await sendPasswordResetCodeEmail(email, code);
}

// Step 1 of "forgot password": emails a 6-digit code. The reply is the same, and takes the same time, whether
// or not the email has an account: the lookup, hashing and sending all happen after the response is sent.
export async function POST(req: Request) {
  try {
    const ipLimited = limitOrNull(`pw-reset-ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
    if (ipLimited) return ipLimited;
    const { email } = await parseBody(req, schema);
    const emailLimited =
      limitOrNull(`pw-reset:${email}`, 3, 15 * 60 * 1000) ?? limitOrNull(`pw-reset-day:${email}`, 6, DAY_MS);
    if (emailLimited) return emailLimited;

    after(() => issueCode(email).catch((err) => console.error("[password-reset] failed:", err)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
