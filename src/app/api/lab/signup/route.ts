import { NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { sendLabAccountExistsEmail, sendLabSignupCodeEmail } from "@/lib/email";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { labSettings } from "@/lib/lab/access";

const LAB_CODE_TTL_MS = 15 * 60 * 1000;

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(12, "Use at least 12 characters").max(200),
}).strict();

// Step 1 of lab sign-up: emails a code. Nothing is created until the code is verified. The reply is the same
// whether or not the email already has an account, so the form can't be used to find out who has one.
export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    if (!(await labSettings()).signupOpen) throw new HttpError(403, "Sign-ups are closed for now.");
    const ipLimited = limitOrNull(`lab-signup-ip:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
    if (ipLimited) return ipLimited;

    const data = await parseBody(req, schema);
    const emailLimited = limitOrNull(`lab-signup:${data.email}`, 3, 15 * 60 * 1000);
    if (emailLimited) return emailLimited;

    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) {
      await sendLabAccountExistsEmail(data.email).catch((err) => console.error("[lab/signup] email failed:", err));
      return NextResponse.json({ ok: true });
    }

    const code = randomInt(100000, 1000000).toString();
    const row = {
      name: data.name,
      passwordHash: await hash(data.password, 12),
      codeHash: await hash(code, 10),
      expiresAt: new Date(Date.now() + LAB_CODE_TTL_MS),
      attempts: 0,
    };
    await prisma.labSignup.upsert({ where: { email: data.email }, create: { email: data.email, ...row }, update: row });
    await sendLabSignupCodeEmail(data.email, code).catch((err) => console.error("[lab/signup] email failed:", err));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
