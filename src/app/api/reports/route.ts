import { NextResponse } from "next/server";
import { attachmentHeader, csvCell } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/app/api/evidence/route";

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.REPORTS_EXPORT);
    const orgId = user.organizationId;
    const url = new URL(req.url);
    const frameworkId = url.searchParams.get("frameworkId");
    const format = url.searchParams.get("format") ?? "json";
    const now = new Date();

    if (!frameworkId) throw new HttpError(400, "frameworkId is required");

    const framework = await prisma.framework.findFirst({
      where: { id: frameworkId, organizationId: orgId },
      include: {
        requirements: {
          include: {
            controlMappings: {
              include: {
                control: {
                  include: {
                    owner: { select: { id: true, name: true } },
                    evidenceLinks: { select: { evidence: { select: { id: true, fileName: true, status: true, validFrom: true, validUntil: true, type: true } } } },
                    tests: { orderBy: [{ testDate: "desc" }, { createdAt: "desc" }], take: 1, select: { result: true, testDate: true, nextDueDate: true, notes: true } },
                    findings: { select: { id: true, title: true, severity: true, status: true, dueDate: true } },
                    exceptions: { where: { status: "APPROVED" }, select: { id: true, reason: true, compensatingControl: true, validFrom: true, validUntil: true } },
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

    const requirements = framework.requirements.map(req => {
      const controls = req.controlMappings.map(cm => {
        const c = cm.control;
        const evidence = c.evidenceLinks.map(l => l.evidence);
        const latestTest = c.tests[0] ?? null;
        const validEvidence = evidence.filter(e => computeEvidenceStatus(e, now) === "VALID");
        const activeExceptions = c.exceptions.filter(e => e.validUntil > now);
        const openFindings = c.findings.filter(f => f.status === "OPEN" || f.status === "IN_PROGRESS");

        let readiness: string;
        if (c.status !== "IMPLEMENTED") readiness = "NOT_IMPLEMENTED";
        else if (validEvidence.length === 0) readiness = "NO_EVIDENCE";
        else if (latestTest?.result === "FAIL") readiness = "FAILING_TEST";
        else if (!latestTest || latestTest.result !== "PASS") readiness = "NOT_TESTED";
        else if (openFindings.length > 0) readiness = "OPEN_FINDING";
        else readiness = "COMPLIANT";

        return {
          mappingType: cm.mappingType,
          controlId: c.id,
          code: (c as any).code,
          title: (c as any).title,
          status: c.status,
          owner: c.owner,
          readiness,
          evidence: evidence.map(e => ({ ...e, computedStatus: computeEvidenceStatus(e, now) })),
          validEvidenceCount: validEvidence.length,
          latestTest: latestTest ? { result: latestTest.result, testDate: latestTest.testDate, nextDueDate: latestTest.nextDueDate, notes: latestTest.notes } : null,
          findings: c.findings,
          openFindingCount: openFindings.length,
          exceptions: c.exceptions.map(e => ({ ...e, isActive: e.validUntil > now })),
          activeExceptionCount: activeExceptions.length,
        };
      });

      const mapped = controls.length > 0;
      let reqReadiness: string;
      if (!mapped) {
        reqReadiness = "UNMAPPED";
      } else {
        const implemented = controls.some(c => c.status === "IMPLEMENTED");
        if (!implemented) { reqReadiness = "MAPPED_NOT_IMPLEMENTED"; }
        else if (!controls.some(c => c.validEvidenceCount > 0)) { reqReadiness = "IMPLEMENTED_NO_EVIDENCE"; }
        else if (controls.some(c => c.latestTest?.result === "FAIL")) { reqReadiness = "FAILING_TEST"; }
        else if (!controls.some(c => c.latestTest?.result === "PASS")) { reqReadiness = "NOT_TESTED"; }
        else if (controls.some(c => c.openFindingCount > 0)) { reqReadiness = "OPEN_FINDING"; }
        else { reqReadiness = "COMPLIANT"; }
      }

      return {
        id: req.id,
        code: req.code,
        title: req.title,
        description: req.description,
        readiness: reqReadiness,
        controlCount: controls.length,
        controls,
      };
    });

    const totalReqs = requirements.length;
    const compliantReqs = requirements.filter(r => r.readiness === "COMPLIANT").length;
    const mappedReqs = requirements.filter(r => r.readiness !== "UNMAPPED").length;
    const readinessScore = totalReqs > 0 ? Math.round((compliantReqs / totalReqs) * 100) : 0;

    const report = {
      generatedAt: now.toISOString(),
      framework: {
        id: framework.id,
        name: framework.name,
        version: framework.version,
        description: framework.description,
        publisher: (framework as any).publisher,
      },
      summary: {
        totalRequirements: totalReqs,
        mappedRequirements: mappedReqs,
        unmappedRequirements: totalReqs - mappedReqs,
        compliantRequirements: compliantReqs,
        readinessScore,
      },
      requirements,
    };

    if (format === "csv") {
      const rows = ["Requirement Code,Requirement Title,Readiness,Control Count,Controls"];
      for (const r of requirements) {
        const ctrlCodes = r.controls.map(c => c.code).join("; ");
        rows.push([r.code, r.title, r.readiness, r.controlCount, ctrlCodes].map(csvCell).join(","));
      }
      return new Response("﻿" + rows.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": attachmentHeader(`${framework.name}-report.csv`),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return NextResponse.json(report);
  } catch (err) {
    return handleError(err);
  }
}
