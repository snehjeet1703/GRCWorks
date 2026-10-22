import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FrameworkBadge } from "@/components/framework-badge";
import { catalogSummary } from "@/lib/framework-catalog";
import { AddFramework } from "./add-framework";

export default async function CompliancePage() {
  const session = await getServerSession(authOptions);
  const orgId = (session!.user as any).organizationId;
  const canManage = ((session!.user as any).permissions ?? []).includes("frameworks:manage");

  const frameworks = await prisma.framework.findMany({
    where: { organizationId: orgId },
    include: {
      requirements: {
        include: {
          controlMappings: {
            include: {
              control: { select: { status: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track your compliance posture across frameworks.
          </p>
        </div>
        {canManage && <AddFramework catalog={catalogSummary()} existing={frameworks.map((f) => f.name)} />}
      </div>

      <div className="grid gap-3">
        {frameworks.map((fw) => {
          const allMappings = fw.requirements.flatMap((r) => r.controlMappings);
          const total = allMappings.length;
          const implemented = allMappings.filter(
            (cm) => cm.control.status === "IMPLEMENTED"
          ).length;
          const percent = total > 0 ? Math.round((implemented / total) * 100) : 0;

          return (
            <Link
              key={fw.id}
              href={`/compliance/${fw.id}`}
              className="card group !p-4 transition-colors hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <FrameworkBadge name={fw.name} />
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight group-hover:underline">{fw.name}</h3>
                    {fw.description && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{fw.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {percent}%
                      <span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">
                        {implemented}/{total}
                      </span>
                    </p>
                    <div
                      className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${fw.name} controls implemented`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
