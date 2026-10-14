import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { periodCoverage } from "@/lib/audit-periods";
import { AuditDetailClient } from "./audit-detail-client";

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("controls:read");
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const permissions: string[] = user.permissions ?? [];

  const cov = await periodCoverage(user.organizationId, id);
  if (!cov) notFound();

  return (
    <AuditDetailClient
      coverage={cov}
      canManage={permissions.includes("frameworks:manage")}
      canEditControls={permissions.includes("controls:write")}
      canExport={permissions.includes("reports:export")}
    />
  );
}
