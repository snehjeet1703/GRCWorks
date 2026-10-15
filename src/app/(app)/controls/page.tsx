import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { ControlsClient } from "./controls-client";

export default async function ControlsPage() {
  await requirePagePermission("controls:read");
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;
  const perms: string[] = (session!.user as any).permissions ?? [];

  const [controls, users, frameworks] = await Promise.all([
    prisma.control.findMany({
      where: { organizationId: orgId },
      include: {
        owner: { select: { id: true, name: true } },
        mappings: { select: { requirement: { select: { code: true, framework: { select: { id: true, name: true } } } } } },
        _count: {
          select: {
            evidenceLinks: true,
            risks: true,
            policies: true,
            tests: true,
            mappings: true,
            findings: true,
            exceptions: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.framework.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Frameworks each control counts towards, with the requirement codes it satisfies in each.
  const frameworksOf = (c: (typeof controls)[number]) => {
    const byId = new Map<string, { id: string; name: string; codes: string[] }>();
    for (const { requirement: r } of c.mappings) {
      const f = byId.get(r.framework.id) ?? { id: r.framework.id, name: r.framework.name, codes: [] };
      f.codes.push(r.code);
      byId.set(r.framework.id, f);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <ControlsClient
      initialControls={controls.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        description: c.description,
        status: c.status,
        reviewState: c.reviewState,
        frequency: c.frequency,
        applicability: c.applicability,
        applicabilityJustification: c.applicabilityJustification,
        implementationNotes: c.implementationNotes,
        ownerId: c.ownerId,
        ownerName: c.owner?.name ?? null,
        frameworks: frameworksOf(c),
        createdAt: c.createdAt.toISOString(),
        deps: (({ evidenceLinks, ...rest }) => ({ ...rest, evidence: evidenceLinks }))(c._count),
      }))}
      users={users}
      frameworks={frameworks}
      canEdit={perms.includes("controls:write")}
    />
  );
}
