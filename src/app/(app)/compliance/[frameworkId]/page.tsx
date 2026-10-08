import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { ChevronLeft, FileDown } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FrameworkBadge } from "@/components/framework-badge";
import { FrameworkControlsClient } from "./framework-controls-client";

export default async function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ frameworkId: string }>;
}) {
  const { frameworkId } = await params;
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

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
                  _count: {
                    select: { evidence: true, risks: true, policies: true },
                  },
                  mappings: {
                    include: {
                      requirement: {
                        include: { framework: { select: { id: true, name: true } } },
                      },
                    },
                  },
                  tests: {
                    orderBy: { testDate: "desc" },
                    take: 1,
                    select: { result: true, testDate: true, nextDueDate: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!framework) notFound();

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rows = framework.requirements
    .flatMap((req) =>
      req.controlMappings.map((cm) => {
        const otherFrameworks = cm.control.mappings
          .filter((m) => m.requirement.framework.id !== framework.id)
          .map((m) => ({ name: m.requirement.framework.name, code: m.requirement.code }));
        const latestTest = cm.control.tests[0] ?? null;
        return {
          id: cm.control.id,
          code: req.code,
          title: cm.control.title,
          description: cm.control.description,
          status: cm.control.status,
          frequency: cm.control.frequency,
          ownerId: cm.control.owner?.id ?? null,
          ownerName: cm.control.owner?.name ?? null,
          evidenceCount: cm.control._count.evidence,
          risksCount: cm.control._count.risks,
          policiesCount: cm.control._count.policies,
          otherFrameworks,
          lastTestResult: latestTest?.result ?? null,
          lastTestDate: latestTest?.testDate?.toISOString() ?? null,
          nextTestDue: latestTest?.nextDueDate?.toISOString() ?? null,
        };
      })
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const implemented = rows.filter((r) => r.status === "IMPLEMENTED").length;
  const percent = rows.length > 0 ? Math.round((implemented / rows.length) * 100) : 0;

  return (
    <div>
      <Link
        href="/compliance"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to frameworks
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <FrameworkBadge name={framework.name} size={52} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{framework.name}</h1>
              {framework.description && (
                <p className="mt-1 text-sm text-gray-500">{framework.description}</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 w-48 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-brand-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm text-gray-600">
              {implemented}/{rows.length} implemented ({percent}%)
            </p>
          </div>
        </div>
        <Link
          href={`/compliance/${framework.id}/report`}
          className="btn-secondary shrink-0"
          title="Auditor-ready report — print or save as PDF"
        >
          <FileDown className="h-4 w-4 mr-2" />
          Generate report
        </Link>
      </div>

      <FrameworkControlsClient
        initialControls={rows}
        users={users}
        canEdit={((session!.user as any).permissions ?? []).includes("controls:write")}
      />
    </div>
  );
}
