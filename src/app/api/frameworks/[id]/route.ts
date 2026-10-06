import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/app/api/evidence/route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.CONTROLS_READ);
    const { id } = await params;

    const framework = await prisma.framework.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        requirements: {
          include: {
            controlMappings: {
              include: {
                control: {
                  include: {
                    owner: { select: { id: true, name: true } },
                    evidence: {
                      select: { id: true, status: true, validFrom: true, validUntil: true },
                    },
                    _count: {
                      select: { evidence: true, tests: true, findings: true, exceptions: true },
                    },
                    tests: {
                      orderBy: [{ testDate: "desc" }, { createdAt: "desc" }],
                      take: 1,
                      select: { result: true, testDate: true, nextDueDate: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!framework) throw new HttpError(404, "Framework not found");

    const now = new Date();
    const requirements = framework.requirements.map((req) => {
      const controls = req.controlMappings.map((cm) => {
        const c = cm.control;
        const latestTest = c.tests[0] ?? null;
        const validEvidenceCount = c.evidence.filter(
          (e) => computeEvidenceStatus(e, now) === "VALID"
        ).length;
        return {
          mappingId: cm.id,
          mappingType: cm.mappingType,
          controlId: c.id,
          code: c.code,
          title: c.title,
          status: c.status,
          frequency: c.frequency,
          applicability: c.applicability,
          owner: c.owner,
          evidenceCount: c._count.evidence,
          validEvidenceCount,
          testCount: c._count.tests,
          findingCount: c._count.findings,
          exceptionCount: c._count.exceptions,
          lastTestResult: latestTest?.result ?? null,
          lastTestDate: latestTest?.testDate?.toISOString() ?? null,
          nextDueDate: latestTest?.nextDueDate?.toISOString() ?? null,
        };
      });

      const mapped = controls.length > 0;
      const implemented = controls.some((c) => c.status === "IMPLEMENTED");
      const hasEvidence = controls.some((c) => c.validEvidenceCount > 0);
      const tested = controls.some((c) => c.lastTestResult === "PASS");
      const hasFailing = controls.some((c) => c.lastTestResult === "FAIL");
      const hasOverdueTest = controls.some((c) => {
        if (!c.lastTestDate) return false;
        const dueDate = c.nextDueDate ? new Date(c.nextDueDate) : null;
        return dueDate ? dueDate < now : false;
      });
      const hasOpenFinding = controls.some((c) => c.findingCount > 0);
      const hasException = controls.some((c) => c.exceptionCount > 0);

      let readiness: string;
      if (!mapped) {
        readiness = "UNMAPPED";
      } else if (!implemented) {
        readiness = "MAPPED_NOT_IMPLEMENTED";
      } else if (!hasEvidence) {
        readiness = "IMPLEMENTED_NO_EVIDENCE";
      } else if (hasFailing) {
        readiness = "FAILING_TEST";
      } else if (!tested) {
        readiness = "NOT_TESTED";
      } else if (hasOverdueTest) {
        readiness = "TESTING_OVERDUE";
      } else if (hasOpenFinding) {
        readiness = "OPEN_FINDING";
      } else {
        readiness = "COMPLIANT";
      }

      return {
        id: req.id,
        code: req.code,
        title: req.title,
        description: req.description,
        mappedControls: controls,
        controlCount: controls.length,
        readiness,
        hasException,
      };
    });

    const totalReqs = requirements.length;
    const compliantReqs = requirements.filter((r) => r.readiness === "COMPLIANT").length;
    const mappedReqs = requirements.filter((r) => r.controlCount > 0).length;

    return NextResponse.json({
      id: framework.id,
      name: framework.name,
      version: framework.version,
      description: framework.description,
      publisher: framework.publisher,
      totalRequirements: totalReqs,
      mappedRequirements: mappedReqs,
      compliantRequirements: compliantReqs,
      requirements,
    });
  } catch (err) {
    return handleError(err);
  }
}
