import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Shield, ChevronRight } from "lucide-react";

export default async function CompliancePage() {
  const session = await getServerSession(authOptions);
  const orgId = (session!.user as any).organizationId;

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
      </div>

      <div className="grid gap-4">
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
              className="card hover:border-brand-300 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-brand-50 p-2.5">
                    <Shield className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 group-hover:text-brand-700">
                      {fw.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fw.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {implemented}/{total} controls
                    </p>
                    <div className="mt-1 h-1.5 w-24 rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-brand-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
