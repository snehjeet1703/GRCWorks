import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { requireLabAdmin } from "@/lib/lab/access";
import { resetPracticeOrg } from "@/lib/lab/provision";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  action: z.enum(["reset", "level", "block", "unblock"]),
  level: z.enum(["beginner", "practitioner", "senior", "expert"]).optional(),
}).strict();

// Support actions on a learner: rebuild their practice company, change their level, or block/unblock the account.
export async function POST(req: Request) {
  try {
    const admin = await requireLabAdmin();
    const d = await parseBody(req, schema);
    const learner = await prisma.user.findUnique({
      where: { email: d.email }, select: { id: true, email: true, organization: { select: { practice: true } } },
    });
    if (!learner?.organization.practice) throw new HttpError(404, "No learner with that email");
    if (learner.email.toLowerCase() === admin.email.toLowerCase() && d.action === "block") throw new HttpError(400, "You can't block yourself");

    if (d.action === "block" || d.action === "unblock") {
      await prisma.user.update({ where: { id: learner.id }, data: { canSignIn: d.action === "unblock" } });
    } else if (d.action === "level") {
      if (!d.level) throw new HttpError(400, "Pick a level");
      await resetPracticeOrg(learner.id, undefined, d.level);
    } else {
      await resetPracticeOrg(learner.id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
