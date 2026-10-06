import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { FindingsClient } from "./findings-client";

export default async function FindingsPage() {
  await requirePagePermission("findings:read");
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [findings, users, controls] = await Promise.all([
    prisma.finding.findMany({
      where: { organizationId: orgId },
      include: {
        control: { select: { id: true, code: true, title: true } },
        risk: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.control.findMany({
      where: { organizationId: orgId },
      select: { id: true, code: true, title: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const permissions = (session!.user as any).permissions ?? [];

  return (
    <FindingsClient
      initialFindings={findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        status: f.status,
        dueDate: f.dueDate?.toISOString() ?? null,
        resolution: f.resolution,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString() ?? null,
        control: f.control,
        risk: f.risk,
        owner: f.owner,
      }))}
      users={users}
      controls={controls}
      canWrite={permissions.includes("findings:write")}
      canClose={permissions.includes("findings:close")}
    />
  );
}
