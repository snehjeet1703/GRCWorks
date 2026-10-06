import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/app/api/evidence/route";

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
    const orgId = user.organizationId;
    const now = new Date();

    const [
      controls,
      evidence,
      findings,
      risks,
      riskActions,
      policies,
      exceptions,
      vendors,
      assessments,
      frameworks,
    ] = await Promise.all([
      prisma.control.findMany({ where: { organizationId: orgId }, include: { tests: { orderBy: [{ testDate: "desc" }, { createdAt: "desc" }], take: 1, select: { result: true, nextDueDate: true } } } }),
      prisma.evidence.findMany({ where: { control: { organizationId: orgId } }, select: { status: true, validFrom: true, validUntil: true } }),
      prisma.finding.findMany({ where: { organizationId: orgId }, select: { status: true, severity: true, dueDate: true } }),
      prisma.risk.findMany({ where: { organizationId: orgId }, select: { status: true, inherentScore: true } }),
      prisma.riskAction.findMany({ where: { risk: { organizationId: orgId } }, select: { status: true, dueDate: true } }),
      prisma.policy.findMany({ where: { organizationId: orgId }, select: { status: true, reviewDate: true, expiresAt: true } }),
      prisma.controlException.findMany({ where: { organizationId: orgId }, select: { status: true, validUntil: true } }),
      prisma.vendor.findMany({ where: { organizationId: orgId }, select: { status: true, riskScore: true } }),
      prisma.vendorAssessment.findMany({ where: { vendor: { organizationId: orgId } }, select: { status: true } }),
      prisma.framework.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, _count: { select: { requirements: true } } } }),
    ]);

    // Controls
    const controlStats = {
      total: controls.length,
      implemented: controls.filter(c => c.status === "IMPLEMENTED").length,
      inProgress: controls.filter(c => c.status === "IN_PROGRESS").length,
      notStarted: controls.filter(c => c.status === "NOT_STARTED").length,
      notApplicable: controls.filter(c => c.status === "NOT_APPLICABLE").length,
    };

    // Evidence
    const evidenceStatuses = evidence.map(e => computeEvidenceStatus(e, now));
    const evidenceStats = {
      total: evidence.length,
      valid: evidenceStatuses.filter(s => s === "VALID").length,
      expired: evidenceStatuses.filter(s => s === "EXPIRED").length,
      expiring: evidenceStatuses.filter(s => s === "EXPIRING").length,
      pending: evidenceStatuses.filter(s => s === "PENDING").length,
      rejected: evidenceStatuses.filter(s => s === "REJECTED").length,
    };

    // Findings
    const openFindings = findings.filter(f => f.status === "OPEN" || f.status === "IN_PROGRESS");
    const overdueFindings = openFindings.filter(f => f.dueDate && f.dueDate < now);
    const findingStats = {
      total: findings.length,
      open: findings.filter(f => f.status === "OPEN").length,
      inProgress: findings.filter(f => f.status === "IN_PROGRESS").length,
      resolved: findings.filter(f => f.status === "RESOLVED").length,
      closed: findings.filter(f => f.status === "CLOSED").length,
      overdue: overdueFindings.length,
      critical: findings.filter(f => f.severity === "CRITICAL" && (f.status === "OPEN" || f.status === "IN_PROGRESS")).length,
      high: findings.filter(f => f.severity === "HIGH" && (f.status === "OPEN" || f.status === "IN_PROGRESS")).length,
    };

    // Risks
    const openRisks = risks.filter(r => r.status === "OPEN" || r.status === "IN_TREATMENT");
    const riskStats = {
      total: risks.length,
      open: openRisks.length,
      critical: openRisks.filter(r => r.inherentScore >= 20).length,
      high: openRisks.filter(r => r.inherentScore >= 12 && r.inherentScore < 20).length,
      closed: risks.filter(r => r.status === "CLOSED").length,
    };

    // Risk actions
    const overdueActions = riskActions.filter(a => (a.status === "PENDING" || a.status === "IN_PROGRESS") && a.dueDate && a.dueDate < now);
    const riskActionStats = {
      total: riskActions.length,
      pending: riskActions.filter(a => a.status === "PENDING").length,
      overdue: overdueActions.length,
    };

    // Policies
    const policyStats = {
      total: policies.length,
      draft: policies.filter(p => p.status === "DRAFT").length,
      inReview: policies.filter(p => p.status === "IN_REVIEW").length,
      approved: policies.filter(p => p.status === "APPROVED").length,
      expired: policies.filter(p => p.status === "EXPIRED").length,
      overdue: policies.filter(p => {
        if (p.status === "EXPIRED" || p.status === "ARCHIVED") return false;
        const d = p.reviewDate ?? p.expiresAt;
        return d && d < now;
      }).length,
    };

    // Exceptions
    const exceptionStats = {
      total: exceptions.length,
      approved: exceptions.filter(e => e.status === "APPROVED").length,
      active: exceptions.filter(e => e.status === "APPROVED" && e.validUntil > now).length,
      expired: exceptions.filter(e => e.status === "APPROVED" && e.validUntil <= now).length,
    };

    // Vendors
    const vendorStats = {
      total: vendors.length,
      active: vendors.filter(v => v.status === "ACTIVE").length,
      assessments: assessments.length,
      completedAssessments: assessments.filter(a => a.status === "COMPLETED").length,
    };

    // Testing
    const testedControls = controls.filter(c => c.tests.length > 0);
    const overdueTests = testedControls.filter(c => {
      const t = c.tests[0];
      return t?.nextDueDate && t.nextDueDate < now;
    });
    const testingStats = {
      tested: testedControls.length,
      passing: testedControls.filter(c => c.tests[0]?.result === "PASS").length,
      failing: testedControls.filter(c => c.tests[0]?.result === "FAIL").length,
      overdue: overdueTests.length,
    };

    // Frameworks
    const frameworkStats = frameworks.map(f => ({
      id: f.id,
      name: f.name,
      totalRequirements: f._count.requirements,
    }));

    return NextResponse.json({
      controls: controlStats,
      evidence: evidenceStats,
      findings: findingStats,
      risks: riskStats,
      riskActions: riskActionStats,
      policies: policyStats,
      exceptions: exceptionStats,
      vendors: vendorStats,
      testing: testingStats,
      frameworks: frameworkStats,
    });
  } catch (err) {
    return handleError(err);
  }
}
