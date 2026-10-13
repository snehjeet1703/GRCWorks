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

  const [controls, users] = await Promise.all([
    prisma.control.findMany({
      where: { organizationId: orgId },
      include: {
        owner: { select: { id: true, name: true } },
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
  ]);

  return (
    <ControlsClient
      initialControls={controls.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        description: c.description,
        status: c.status,
        frequency: c.frequency,
        applicability: c.applicability,
        applicabilityJustification: c.applicabilityJustification,
        implementationNotes: c.implementationNotes,
        ownerId: c.ownerId,
        ownerName: c.owner?.name ?? null,
        createdAt: c.createdAt.toISOString(),
        deps: (({ evidenceLinks, ...rest }) => ({ ...rest, evidence: evidenceLinks }))(c._count),
      }))}
      users={users}
      canEdit={perms.includes("controls:write")}
    />
  );
}
