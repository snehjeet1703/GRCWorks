import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { resetPracticeOrg } from "@/lib/lab/provision";

// Starts the learner's practice company again from the template. Progress is kept per company, so it restarts too.
const schema = z.object({ template: z.string().max(64).optional(), level: z.enum(["beginner", "practitioner", "senior", "expert"]).optional() }).strict();

// Optionally with a different industry's practice company.
export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    const limited = limitOrNull(`lab-reset:${user.id}`, 5, 60 * 60 * 1000);
    if (limited) return limited;
    const { template, level } = await parseBody(req, schema);
    await resetPracticeOrg(user.id, template, level);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
