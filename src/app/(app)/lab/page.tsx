import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { industryChoices, labContent, labMode, videoEmbedUrl } from "@/lib/lab/content";
import { evaluateCourse } from "@/lib/lab/checks";
import { levelLabel, levelOf } from "@/lib/lab/levels";
import { PLANS, isLabAdmin, paymentText, pricingText } from "@/lib/lab/access";
import { LabClient, type LabView } from "./lab-client";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  if (!labMode) notFound();
  const session = await getServerSession(authOptions);
  const orgId: string = (session!.user as any).organizationId;
  const userId: string = (session!.user as any).id;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { practice: true, labLevel: true } });
  if (!org?.practice) notFound();

  const result = await evaluateCourse(orgId, userId);
  if (!result) notFound();
  const { template } = result;
  // Start over offers the main course's industries, so learners on an older course can move across.
  const main = (await labContent()).courses[0];
  const industries = (await industryChoices(main.id)).sort((a, b) => a.industry.localeCompare(b.industry));
  if (!industries.some((i) => i.id === template.id)) {
    industries.unshift({ id: template.id, industry: template.company.industry, company: template.company.name, description: template.company.description });
  }

  const labs: LabView[] = result.course.labs.map((lab, i) => ({
    id: lab.id,
    title: lab.title,
    minutes: lab.minutes,
    objective: lab.objective,
    videoEmbed: videoEmbedUrl(lab.videoUrl),
    locked: result.labs[i].locked,
    tasks: lab.tasks.map((t, j) => ({
      id: t.id, title: t.title, instructions: t.instructions, hints: t.hints, link: t.link ?? null,
      done: result.labs[i].tasks[j].done,
    })),
  }));

  // Finishing every task on a paid plan earns a certificate for this course and level (issued once).
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const complete = result.labs.every((l) => !l.locked && l.tasks.every((t) => t.done));
  const level = levelOf(org.labLevel);
  let certificate = await prisma.labCertificate.findFirst({ where: { userId, courseId: result.course.id, level: levelLabel(level) } });
  if (!certificate && complete && result.access.paid) {
    certificate = await prisma.labCertificate.create({
      data: { userId, courseId: result.course.id, name: user.name, course: result.course.title, industry: template.company.industry, level: levelLabel(level) },
    });
  }
  const managesTeam = (await prisma.labAccessCode.count({ where: { plan: "team", managerEmail: { equals: user.email, mode: "insensitive" } } })) > 0;

  return (
    <LabClient
      access={{
        plan: PLANS[result.access.plan].label, paid: result.access.paid,
        expiresAt: result.access.expiresAt?.toISOString() ?? null, pricing: pricingText(), payment: paymentText(),
      }}
      certificateId={certificate?.id ?? null}
      links={{ admin: isLabAdmin(user.email), team: managesTeam }}
      courseTitle={result.course.title}
      company={{ id: template.id, name: template.company.name, industry: template.company.industry, description: template.company.description }}
      industries={industries}
      level={levelOf(org.labLevel)}
      labs={labs}
    />
  );
}
