import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { VendorsClient } from "./vendors-client";

export default async function VendorsPage() {
  await requirePagePermission("vendors:read");
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const orgId = user.organizationId;
  const perms: string[] = user.permissions ?? [];

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: orgId },
    include: {
      assessments: {
        orderBy: { assessmentDate: "desc" },
        take: 1,
        select: { id: true, overallScore: true, status: true, assessmentDate: true },
      },
      _count: { select: { assessments: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <VendorsClient
      initialVendors={JSON.parse(JSON.stringify(vendors))}
      canWrite={perms.includes("vendors:write")}
    />
  );
}
