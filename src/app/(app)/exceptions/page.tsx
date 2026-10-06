import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { ExceptionsClient } from "./exceptions-client";

export default async function ExceptionsPage() {
  await requirePagePermission("exceptions:read");
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [exceptions, users, controls] = await Promise.all([
    prisma.controlException.findMany({
      where: { organizationId: orgId },
      include: {
        control: { select: { id: true, code: true, title: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.control.findMany({
      where: { organizationId: orgId },
      select: { id: true, code: true, title: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const permissions = (session!.user as any).permissions ?? [];

  return (
    <ExceptionsClient
      initialExceptions={exceptions.map((ex) => ({
        id: ex.id,
        reason: ex.reason,
        compensatingControl: ex.compensatingControl,
        validFrom: ex.validFrom.toISOString(),
        validUntil: ex.validUntil.toISOString(),
        status: ex.status,
        notes: ex.notes,
        createdAt: ex.createdAt.toISOString(),
        control: ex.control,
        requestedBy: ex.requestedBy,
        approvedBy: ex.approvedBy,
      }))}
      users={users}
      controls={controls}
      canRequest={permissions.includes("exceptions:request")}
      canApprove={permissions.includes("exceptions:approve")}
    />
  );
}
