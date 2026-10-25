import { NextResponse } from "next/server";
import { handleError, HttpError, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { resetPracticeOrg } from "@/lib/lab/provision";

// Starts the learner's practice company again from the template. Progress is kept per company, so it restarts too.
export async function POST() {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    const limited = limitOrNull(`lab-reset:${user.id}`, 5, 60 * 60 * 1000);
    if (limited) return limited;
    await resetPracticeOrg(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
