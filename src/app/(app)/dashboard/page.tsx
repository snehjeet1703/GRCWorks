import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [frameworks, allControls, risks, policies, evidence, findings, exceptions, auditLogs, activityByDay] = await Promise.all([
    prisma.framework.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        requirements: {
          select: {
            controlMappings: { select: { id: true, controlId: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.control.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        status: true,
        _count: { select: { evidenceLinks: true, risks: true, policies: true } },
      },
    }),
    prisma.risk.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        title: true,
        likelihood: true,
        impact: true,
        inherentScore: true,
        residualScore: true,
        status: true,
        treatment: true,
        ownerId: true,
        owner: { select: { name: true } },
        controls: { select: { controlId: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.policy.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        title: true,
        status: true,
        controls: { select: { controlId: true } },
      },
    }),
    prisma.evidence.findMany({
      where: { organizationId: orgId },
      select: { id: true, status: true, validUntil: true, controls: { select: { controlId: true } } },
    }),
    prisma.finding.findMany({
      where: { organizationId: orgId },
      select: { id: true, severity: true, status: true, controlId: true },
    }),
    prisma.controlException.findMany({
      where: { organizationId: orgId },
      select: { id: true, status: true, validUntil: true },
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        userName: true,
        action: true,
        entityType: true,
        entityId: true,
        entityName: true,
      },
    }),
    prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
      FROM audit_logs
      WHERE organization_id = ${orgId} AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1`,
  ]);

  return (
    <DashboardClient
      frameworks={frameworks.map((f) => ({
        id: f.id,
        name: f.name,
        citations: f.requirements.flatMap((r) =>
          r.controlMappings.map((cm) => ({ frameworkControlId: cm.id, controlId: cm.controlId }))
        ),
      }))}
      controls={allControls.map((c) => ({
        id: c.id,
        status: c.status,
        evidenceCount: c._count.evidenceLinks,
        risksCount: c._count.risks,
        policiesCount: c._count.policies,
      }))}
      risks={risks.map((r) => ({
        id: r.id,
        title: r.title,
        likelihood: r.likelihood,
        impact: r.impact,
        inherentScore: r.inherentScore,
        residualScore: r.residualScore,
        riskStatus: r.status,
        treatment: r.treatment,
        ownerName: r.owner?.name ?? null,
        controlIds: r.controls.map((c) => c.controlId),
        updatedAt: r.updatedAt.toISOString(),
      }))}
      policies={policies.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        controlIds: p.controls.map((c) => c.controlId),
      }))}
      evidence={evidence.map((e) => ({
        id: e.id,
        controlIds: e.controls.map((l) => l.controlId),
        status: e.status,
        validUntil: e.validUntil?.toISOString() ?? null,
      }))}
      findings={findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        status: f.status,
        controlId: f.controlId,
      }))}
      exceptions={exceptions.map((ex) => ({
        id: ex.id,
        status: ex.status,
        validUntil: ex.validUntil.toISOString(),
      }))}
      auditLogs={auditLogs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        userName: l.userName,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        entityName: l.entityName,
      }))}
      activityByDay={activityByDay.map((a) => ({
        day: a.day.toISOString().slice(0, 10),
        count: a.count,
      }))}
    />
  );
}
