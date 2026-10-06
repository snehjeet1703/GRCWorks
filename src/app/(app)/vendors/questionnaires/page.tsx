import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { QuestionnairesClient } from "./questionnaires-client";

export default async function QuestionnairesPage() {
  await requirePagePermission("vendors:read");
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const orgId = user.organizationId;
  const perms: string[] = user.permissions ?? [];

  const questionnaires = await prisma.vendorQuestionnaire.findMany({
    where: { organizationId: orgId },
    include: { _count: { select: { responses: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });

  return (
    <QuestionnairesClient
      initialQuestionnaires={JSON.parse(JSON.stringify(questionnaires))}
      vendors={JSON.parse(JSON.stringify(vendors))}
      canWrite={perms.includes("vendors:write")}
    />
  );
}
