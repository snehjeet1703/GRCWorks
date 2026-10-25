import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { labContent, labMode } from "@/lib/lab/content";
import { provisionPracticeOrg } from "@/lib/lab/provision";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  template: z.string().max(64).optional(),
}).strict();

// Step 2 of lab sign-up: checks the code, then creates the account and its practice company.
export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const limited = limitOrNull(`lab-verify-ip:${clientIp(req.headers)}`, 20, 60 * 60 * 1000);
    if (limited) return limited;

    const { email, code, template } = await parseBody(req, schema);
    const pending = await prisma.labSignup.findUnique({ where: { email } });
    if (!pending || pending.expiresAt < new Date() || pending.attempts >= MAX_ATTEMPTS) {
      throw new HttpError(400, "This code has expired. Start again to get a new one.");
    }
    if (!(await compare(code, pending.codeHash))) {
      await prisma.labSignup.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
      throw new HttpError(400, "That code isn't right.");
    }
    // Claim the sign-up first so two concurrent verifies can't both create an account.
    const claimed = await prisma.labSignup.deleteMany({ where: { id: pending.id } });
    if (claimed.count === 0) throw new HttpError(409, "Already verified. Sign in instead.");
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new HttpError(409, "You already have an account. Sign in instead.");
    }

    // Every learner starts on the first course; more courses can be added from the Labs page later.
    const course = (await labContent()).courses[0];
    if (!course) throw new HttpError(503, "No labs are available yet");
    await provisionPracticeOrg(course.id, template ?? null, { email, name: pending.name, passwordHash: pending.passwordHash });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
