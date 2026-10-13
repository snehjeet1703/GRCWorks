import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/app/api/evidence/route";

function computeRequirementReadiness(
  controls: Array<{
    status: string;
    applicability: string;
    applicabilityJustification: string | null;
    validEvidenceCount: number;
    lastTestResult: string | null;
    nextDueDate: Date | null;
    openFindingCount: number;
    activeExceptionCount: number;
    expiredExceptionCount: number;
  }>,
  now: Date
) {
  if (controls.length === 0) return "UNMAPPED";

  const applicableControls = controls.filter(c => c.applicability !== "NOT_APPLICABLE");
  if (applicableControls.length === 0) return "NOT_APPLICABLE";

  const implemented = applicableControls.some(c => c.status === "IMPLEMENTED");
  if (!implemented) return "MAPPED_NOT_IMPLEMENTED";

  const hasEvidence = applicableControls.some(c => c.validEvidenceCount > 0);
  if (!hasEvidence) return "IMPLEMENTED_NO_EVIDENCE";

  const hasFailing = applicableControls.some(c => c.lastTestResult === "FAIL");
  if (hasFailing) return "FAILING_TEST";

  const tested = applicableControls.some(c => c.lastTestResult === "PASS");
  if (!tested) return "NOT_TESTED";

  const hasOverdueTest = applicableControls.some(c => c.nextDueDate && c.nextDueDate < now);
  if (hasOverdueTest) return "TESTING_OVERDUE";

  const hasOpenFinding = applicableControls.some(c => c.openFindingCount > 0);
  if (hasOpenFinding) return "OPEN_FINDING";

  return "COMPLIANT";
}

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const orgId = user.organizationId;
    const url = new URL(req.url);
    const frameworkId = url.searchParams.get("frameworkId");
    const controlStatus = url.searchParams.get("controlStatus");
    const search = url.searchParams.get("search");
    const now = new Date();

    const fwWhere: Record<string, unknown> = { organizationId: orgId };
    if (frameworkId) fwWhere.id = frameworkId;

    const frameworks = await prisma.framework.findMany({
      where: fwWhere,
      include: {
        requirements: {
          include: {
            controlMappings: {
              include: {
                control: {
                  include: {
                    evidenceLinks: { select: { evidence: { select: { status: true, validFrom: true, validUntil: true } } } },
                    tests: { orderBy: [{ testDate: "desc" }, { createdAt: "desc" }], take: 1, select: { result: true, nextDueDate: true } },
                    findings: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true, severity: true } },
                    exceptions: { where: { status: "APPROVED" }, select: { id: true, validUntil: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = frameworks.map(fw => {
      const requirements = fw.requirements.map(req => {
        const controls = req.controlMappings.map(cm => {
          const c = cm.control;
          const validEvidence = c.evidenceLinks.filter(l => computeEvidenceStatus(l.evidence, now) === "VALID").length;
          const latestTest = c.tests[0] ?? null;
          const activeExceptions = c.exceptions.filter(e => e.validUntil > now).length;
          const expiredExceptions = c.exceptions.filter(e => e.validUntil <= now).length;
          return {
            controlId: c.id,
            status: c.status,
            applicability: (c as any).applicability ?? "APPLICABLE",
            applicabilityJustification: (c as any).applicabilityJustification ?? null,
            validEvidenceCount: validEvidence,
            lastTestResult: latestTest?.result ?? null,
            nextDueDate: latestTest?.nextDueDate ?? null,
            openFindingCount: c.findings.length,
            openFindings: c.findings,
            activeExceptionCount: activeExceptions,
            expiredExceptionCount: expiredExceptions,
          };
        });

        let filteredOut = false;
        if (controlStatus) {
          const hasMatchingControl = controls.some(c => c.status === controlStatus);
          if (!hasMatchingControl && controls.length > 0) filteredOut = true;
        }
        if (search) {
          const s = search.toLowerCase();
          const matchReq = req.code.toLowerCase().includes(s) || req.title.toLowerCase().includes(s);
          const matchCtrl = controls.some(c => false); // controls matched at framework level
          if (!matchReq && !matchCtrl) filteredOut = true;
        }

        const readiness = computeRequirementReadiness(controls, now);
        const hasActiveException = controls.some(c => c.activeExceptionCount > 0);
        const hasExpiredException = controls.some(c => c.expiredExceptionCount > 0);

        return filteredOut ? null : {
          id: req.id,
          code: req.code,
          title: req.title,
          controlCount: controls.length,
          readiness,
          hasActiveException,
          hasExpiredException,
          controls: controls.map(c => ({
            controlId: c.controlId,
            status: c.status,
            applicability: c.applicability,
            applicabilityJustification: c.applicabilityJustification,
            validEvidenceCount: c.validEvidenceCount,
            lastTestResult: c.lastTestResult,
            openFindingCount: c.openFindingCount,
            activeExceptionCount: c.activeExceptionCount,
            expiredExceptionCount: c.expiredExceptionCount,
          })),
        };
      }).filter(Boolean);

      const totalReqs = requirements.length;
      const compliantReqs = requirements.filter(r => r!.readiness === "COMPLIANT").length;
      const mappedReqs = requirements.filter(r => r!.controlCount > 0).length;
      const unmappedReqs = requirements.filter(r => r!.readiness === "UNMAPPED").length;
      const implementedControls = requirements.flatMap(r => r!.controls).filter(c => c.status === "IMPLEMENTED").length;
      const missingEvidence = requirements.flatMap(r => r!.controls).filter(c => c.status === "IMPLEMENTED" && c.validEvidenceCount === 0).length;
      const failedTests = requirements.flatMap(r => r!.controls).filter(c => c.lastTestResult === "FAIL").length;
      const openFindings = requirements.flatMap(r => r!.controls).reduce((sum, c) => sum + c.openFindingCount, 0);
      const activeExceptions = requirements.flatMap(r => r!.controls).reduce((sum, c) => sum + c.activeExceptionCount, 0);

      const readinessScore = totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

      return {
        id: fw.id,
        name: fw.name,
        version: fw.version,
        totalRequirements: totalReqs,
        mappedRequirements: mappedReqs,
        unmappedRequirements: unmappedReqs,
        compliantRequirements: compliantReqs,
        readinessScore,
        metrics: {
          implementedControls,
          missingEvidence,
          failedTests,
          openFindings,
          activeExceptions,
        },
        requirements,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
