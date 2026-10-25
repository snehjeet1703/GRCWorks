import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { loadExercise } from "@/lib/lab/checks";
import { grade } from "@/lib/lab/exercises";
import { LEVEL_TUNING } from "@/lib/lab/levels";

const schema = z.object({
  labId: z.string().max(64),
  taskId: z.string().max(64),
  flags: z.record(z.string().max(16), z.string().max(32)).refine((f) => Object.keys(f).length <= 200, "Too many rows"),
}).strict();

// Grades a learner's flags on an exercise. Until they pass, they only learn how many of each problem they missed;
// once passed, the answer key with explanations is returned.
export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    const limited = limitOrNull(`lab-exercise:${user.id}`, 60, 60 * 60 * 1000);
    if (limited) return limited;
    const { labId, taskId, flags } = await parseBody(req, schema);
    const loaded = await loadExercise(user.organizationId, user.id, labId, taskId);
    if (!loaded) throw new HttpError(404, "Exercise not found");

    const result = grade(loaded.exercise, flags, loaded.level);
    await prisma.labExerciseAttempt.create({
      data: {
        organizationId: user.organizationId, labId, taskId, flags,
        found: result.found, planted: result.planted, falseAlarms: result.falseAlarms, passed: result.passed,
      },
    });
    const explain = new Map(loaded.exercise.options.map((o) => [o.value, o]));
    // Feedback narrows with experience: beginners see the rows still wrong, experts only pass or fail.
    const fb = LEVEL_TUNING[loaded.level].feedback;
    return NextResponse.json({
      passed: result.passed,
      planted: fb === "passfail" && !result.passed ? null : result.planted,
      allowedFalseAlarms: result.allowedFalseAlarms,
      feedback: fb,
      found: fb === "passfail" && !result.passed ? null : result.found,
      falseAlarms: fb === "passfail" && !result.passed ? null : result.falseAlarms,
      wrongReason: fb === "rows" || fb === "types" || result.passed ? result.wrongReason : null,
      missedByType: fb === "rows" || fb === "types" ? result.missedByType : [],
      wrongRows: fb === "rows" ? result.wrongRows : [],
      key: result.passed
        ? Object.entries(loaded.exercise.answers)
            .filter(([, v]) => v !== "OK")
            .map(([row, v]) => ({ row, label: explain.get(v)?.label ?? v, explain: explain.get(v)?.explain ?? "" }))
        : null,
    });
  } catch (err) {
    return handleError(err);
  }
}
