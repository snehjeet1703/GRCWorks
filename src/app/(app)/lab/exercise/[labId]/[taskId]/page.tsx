import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { labMode } from "@/lib/lab/content";
import { loadExercise } from "@/lib/lab/checks";
import { publicExercise } from "@/lib/lab/exercises";
import { ExerciseClient } from "./exercise-client";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ labId: string; taskId: string }> }) {
  if (!labMode) notFound();
  const { labId, taskId } = await params;
  const session = await getServerSession(authOptions);
  const orgId: string = (session!.user as any).organizationId;
  const loaded = await loadExercise(orgId, labId, taskId);
  if (!loaded) notFound();

  const last = await prisma.labExerciseAttempt.findFirst({
    where: { organizationId: orgId, labId, taskId }, orderBy: { createdAt: "desc" },
  });
  const passedBefore = (await prisma.labExerciseAttempt.count({ where: { organizationId: orgId, labId, taskId, passed: true } })) > 0;
  const options = new Map(loaded.exercise.options.map((o) => [o.value, o]));

  return (
    <ExerciseClient
      labId={labId}
      taskId={taskId}
      labTitle={loaded.lab.title}
      task={{ title: loaded.task.title, instructions: loaded.task.instructions, hints: loaded.task.hints }}
      exercise={publicExercise(loaded.exercise)}
      savedFlags={(last?.flags as Record<string, string> | null) ?? {}}
      answerKey={passedBefore
        ? Object.entries(loaded.exercise.answers).filter(([, v]) => v !== "OK")
            .map(([row, v]) => ({ row, label: options.get(v)?.label ?? v, explain: options.get(v)?.explain ?? "" }))
        : null}
    />
  );
}
