import { NextResponse } from "next/server";
import { handleError, HttpError, requireSession } from "@/lib/api";
import { labMode } from "@/lib/lab/content";
import { evaluateCourse } from "@/lib/lab/checks";

// Re-runs the learner's task checks; the Labs page polls this so tasks tick as the learner works.
export async function GET() {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    const result = await evaluateCourse(user.organizationId, user.id);
    if (!result) throw new HttpError(404, "This organisation has no lab");
    return NextResponse.json({ labs: result.labs });
  } catch (err) {
    return handleError(err);
  }
}
