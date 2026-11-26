import { NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { sendPasswordChangedEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: z.string().min(12, "Use at least 12 characters").max(200),
}).strict();

// Step 2 of "forgot password": checks the emailed code and sets the new password. Two-factor sign-in, if the
// account uses it, is unchanged and still asked for at the next sign-in.
export async function POST(req: Request) {
  try {
    const limited = limitOrNull(`pw-reset-confirm-ip:${clientIp(req.headers)}`, 20, 60 * 60 * 1000);
    if (limited) return limited;

    const { email, code, password } = await parseBody(req, schema);
    const pending = await prisma.passwordReset.findUnique({ where: { email } });
    if (!pending || pending.expiresAt < new Date() || pending.attempts >= MAX_ATTEMPTS) {
      throw new HttpError(400, "This code has expired. Start again to get a new one.");
    }
    if (!(await compare(code, pending.codeHash))) {
      await prisma.passwordReset.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
      throw new HttpError(400, "That code isn't right.");
    }
    // Claim the code first so it can only be used once, even with two requests at the same moment.
    const claimed = await prisma.passwordReset.deleteMany({ where: { id: pending.id } });
    if (claimed.count === 0) throw new HttpError(400, "This code has already been used. Start again to get a new one.");

    const updated = await prisma.user.updateMany({
      where: { email, canSignIn: true, passwordHash: { not: null } },
      data: { passwordHash: await hash(password, 12) },
    });
    if (updated.count === 0) throw new HttpError(400, "This code has expired. Start again to get a new one.");
    await sendPasswordChangedEmail(email).catch((err) => console.error("[password-reset] email failed:", err));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
