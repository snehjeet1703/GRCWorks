import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { RisksClient } from "./risks-client";

export default async function RisksPage() {
  await requirePagePermission("risks:read");
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [risks, users, controls] = await Promise.all([
    prisma.risk.findMany({
      where: { organizationId: orgId },
      include: {
        owner: { select: { id: true, name: true } },
        controls: {
          include: { control: { select: { id: true, code: true } } },
        },
        actions: {
          include: { owner: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ impact: "desc" }, { likelihood: "desc" }],
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.control.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        code: true,
        title: true,
        mappings: {
          select: {
            requirement: {
              select: { framework: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  const allControls = controls.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    frameworkNames: [...new Set(c.mappings.map((m) => m.requirement.framework.name))],
  }));

  return (
    <RisksClient
      initialRisks={risks.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        likelihood: r.likelihood,
        impact: r.impact,
        inherentScore: r.inherentScore,
        residualScore: r.residualScore,
        status: r.status,
        treatment: r.treatment,
        treatmentPlan: r.treatmentPlan,
        ownerId: r.ownerId,
        owner: r.owner,
        linkedControlIds: r.controls.map((c) => c.controlId),
        linkedControlCodes: r.controls.map((c) => c.control.code).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        actions: r.actions.map((a) => ({
          id: a.id,
          action: a.action,
          status: a.status,
          dueDate: a.dueDate?.toISOString() ?? null,
          completedAt: a.completedAt?.toISOString() ?? null,
          notes: a.notes,
          owner: a.owner,
        })),
      }))}
      users={users}
      allControls={allControls}
      canEdit={((session!.user as any).permissions ?? []).includes("risks:write")}
    />
  );
}
