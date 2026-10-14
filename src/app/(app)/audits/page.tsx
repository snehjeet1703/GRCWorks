import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { periodCoverage } from "@/lib/audit-periods";
import { AuditsClient, type PeriodSummary } from "./audits-client";

export default async function AuditsPage() {
  await requirePagePermission("controls:read");
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const orgId: string = user.organizationId;
  const permissions: string[] = user.permissions ?? [];

  const [periods, frameworks] = await Promise.all([
    prisma.auditPeriod.findMany({ where: { organizationId: orgId }, select: { id: true }, orderBy: { startDate: "desc" } }),
    prisma.framework.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const summaries: PeriodSummary[] = [];
  for (const { id } of periods) {
    const cov = await periodCoverage(orgId, id);
    if (cov) summaries.push({ ...cov.period, counts: cov.counts, controlCount: cov.controls.length });
  }

  return (
    <AuditsClient
      periods={summaries}
      frameworks={frameworks}
      canManage={permissions.includes("frameworks:manage")}
    />
  );
}
