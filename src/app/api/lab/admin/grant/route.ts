import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { extendAccess, requireLabAdmin } from "@/lib/lab/access";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // A plan and months to add, or "revoke" to end paid access now (e.g. after a refund).
  plan: z.enum(["individual", "bundle", "team", "revoke"]),
  months: z.number().int().min(1).max(36).optional(),
  note: z.string().trim().max(500).default(""),
}).strict();

// Gives, extends or ends a learner's paid access directly, without a code.
export async function POST(req: Request) {
  try {
    const me = await requireLabAdmin();

    const d = await parseBody(req, schema);
    const learner = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true } });
    if (!learner) throw new HttpError(404, "No learner with that email. They need to sign up first.");
    if (d.plan === "revoke") {
      await prisma.labAccess.updateMany({ where: { userId: learner.id }, data: { expiresAt: new Date(), note: d.note || "Revoked" } });
      return NextResponse.json({ ok: true });
    }
    if (!d.months) throw new HttpError(400, "How many months?");
    const access = await extendAccess(learner.id, d.plan, d.months, { note: d.note || `Granted by ${me.email}` });
    return NextResponse.json({ plan: access.plan, expiresAt: access.expiresAt });
  } catch (err) {
    return handleError(err);
  }
}
