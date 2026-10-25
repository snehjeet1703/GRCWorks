import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { loadExercise } from "@/lib/lab/checks";
import { grade } from "@/lib/lab/exercises";

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
    const loaded = await loadExercise(user.organizationId, labId, taskId);
    if (!loaded) throw new HttpError(404, "Exercise not found");

    const result = grade(loaded.exercise, flags);
    await prisma.labExerciseAttempt.create({
      data: {
        organizationId: user.organizationId, labId, taskId, flags,
        found: result.found, planted: result.planted, falseAlarms: result.falseAlarms, passed: result.passed,
      },
    });
    const explain = new Map(loaded.exercise.options.map((o) => [o.value, o]));
    return NextResponse.json({
      ...result,
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
