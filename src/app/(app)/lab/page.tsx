import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { industryChoices, labMode, videoEmbedUrl } from "@/lib/lab/content";
import { evaluateCourse } from "@/lib/lab/checks";
import { LabClient, type LabView } from "./lab-client";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  if (!labMode) notFound();
  const session = await getServerSession(authOptions);
  const orgId: string = (session!.user as any).organizationId;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { practice: true } });
  if (!org?.practice) notFound();

  const result = await evaluateCourse(orgId);
  if (!result) notFound();
  const { template } = result;
  const industries = await industryChoices(result.course.id);

  const labs: LabView[] = result.course.labs.map((lab, i) => ({
    id: lab.id,
    title: lab.title,
    minutes: lab.minutes,
    objective: lab.objective,
    videoEmbed: videoEmbedUrl(lab.videoUrl),
    tasks: lab.tasks.map((t, j) => ({
      id: t.id, title: t.title, instructions: t.instructions, hints: t.hints, link: t.link ?? null,
      done: result.labs[i].tasks[j].done,
    })),
  }));

  return (
    <LabClient
      courseTitle={result.course.title}
      company={{ id: template.id, name: template.company.name, industry: template.company.industry, description: template.company.description }}
      industries={industries}
      labs={labs}
    />
  );
}
