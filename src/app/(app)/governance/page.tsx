import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { PoliciesClient } from "./policies-client";

export default async function GovernancePage() {
  await requirePagePermission("policies:read");
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [policies, controls] = await Promise.all([
    prisma.policy.findMany({
      where: { organizationId: orgId },
      include: {
        approver: { select: { id: true, name: true } },
        controls: {
          include: { control: { select: { id: true, code: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
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
    <PoliciesClient
      initialPolicies={policies.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        status: p.status,
        version: p.version,
        approver: p.approver,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        linkedControlIds: p.controls.map((c) => c.controlId),
        linkedControlCodes: p.controls
          .map((c) => c.control.code)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      }))}
      allControls={allControls}
      canEdit={((session!.user as any).permissions ?? []).includes("policies:write")}
    />
  );
}
