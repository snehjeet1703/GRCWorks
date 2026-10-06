import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ReportView } from "./report-view";

export default async function FrameworkReportPage({
  params,
}: {
  params: Promise<{ frameworkId: string }>;
}) {
  const { frameworkId } = await params;
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [framework, org] = await Promise.all([
    prisma.framework.findFirst({
      where: { id: frameworkId, organizationId: orgId },
      include: {
        requirements: {
          include: {
            controlMappings: {
              include: {
                control: {
                  include: {
                    evidence: {
                      include: { uploadedBy: { select: { name: true } } },
                      orderBy: { createdAt: "desc" },
                    },
                    risks: {
                      include: {
                        risk: {
                          select: {
                            id: true,
                            title: true,
                            likelihood: true,
                            impact: true,
                            treatment: true,
                          },
                        },
                      },
                    },
                    policies: {
                      include: {
                        policy: {
                          select: {
                            id: true,
                            title: true,
                            status: true,
                            version: true,
                            approvedAt: true,
                          },
                        },
                      },
                    },
                    mappings: {
                      include: {
                        requirement: {
                          include: { framework: { select: { id: true, name: true } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, slug: true },
    }),
  ]);
  if (!framework || !org) notFound();

  const rows = framework.requirements
    .flatMap((req) =>
      req.controlMappings.map((cm) => ({
        id: cm.control.id,
        code: req.code,
        title: cm.control.title,
        description: cm.control.description,
        status: cm.control.status,
        frequency: cm.control.frequency,
        updatedAt: cm.control.updatedAt.toISOString(),
        evidence: cm.control.evidence.map((e) => ({
          id: e.id,
          fileName: e.fileName,
          fileSize: e.fileSize,
          notes: e.notes,
          createdAt: e.createdAt.toISOString(),
          uploadedByName: e.uploadedBy?.name ?? "(deleted user)",
        })),
        risks: cm.control.risks.map((rc) => ({
          id: rc.risk.id,
          title: rc.risk.title,
          score: rc.risk.likelihood * rc.risk.impact,
          treatment: rc.risk.treatment,
        })),
        policies: cm.control.policies.map((pc) => ({
          id: pc.policy.id,
          title: pc.policy.title,
          status: pc.policy.status,
          version: pc.policy.version,
          approvedAt: pc.policy.approvedAt?.toISOString() ?? null,
        })),
        alsoSatisfies: cm.control.mappings
          .filter((m) => m.requirement.framework.id !== framework.id)
          .map((m) => ({ name: m.requirement.framework.name, code: m.requirement.code })),
      }))
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const controlIds = rows.map((r) => r.id);

  const [allRisks, allPolicies, auditLogs] = await Promise.all([
    prisma.risk.findMany({
      where: { organizationId: orgId, controls: { some: { controlId: { in: controlIds } } } },
      include: { owner: { select: { name: true } } },
      orderBy: [{ impact: "desc" }, { likelihood: "desc" }],
    }),
    prisma.policy.findMany({
      where: { organizationId: orgId, controls: { some: { controlId: { in: controlIds } } } },
      include: { approver: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        OR: [
          { entityType: "Control", entityId: { in: controlIds } },
          { entityType: "Evidence" },
          { entityType: "Framework", entityId: framework.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <ReportView
      organization={org}
      framework={{
        id: framework.id,
        name: framework.name,
        version: framework.version,
        description: framework.description,
      }}
      controls={rows}
      risks={allRisks.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        likelihood: r.likelihood,
        impact: r.impact,
        treatment: r.treatment,
        treatmentPlan: r.treatmentPlan,
        ownerName: r.owner?.name ?? null,
      }))}
      policies={allPolicies.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        version: p.version,
        approverName: p.approver?.name ?? null,
        approvedAt: p.approvedAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
      }))}
      auditLogs={auditLogs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        userName: l.userName,
        action: l.action,
        entityType: l.entityType,
        entityName: l.entityName,
      }))}
      generatedAt={new Date().toISOString()}
      generatedByName={session!.user.name}
      backHref={`/compliance/${framework.id}`}
    />
  );
}
