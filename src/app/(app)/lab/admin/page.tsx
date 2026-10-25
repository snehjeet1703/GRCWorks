import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { labMode } from "@/lib/lab/content";
import { isLabAdmin } from "@/lib/lab/access";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function LabAdminPage() {
  if (!labMode) notFound();
  const session = await getServerSession(authOptions);
  const me = await prisma.user.findUnique({ where: { id: (session!.user as any).id }, select: { email: true } });
  if (!isLabAdmin(me?.email)) notFound();

  const [codes, learners] = await Promise.all([
    prisma.labAccessCode.findMany({
      orderBy: { createdAt: "desc" }, take: 300,
      include: { redemptions: { include: { user: { select: { email: true } } } } },
    }),
    // Learners are the people who can sign in to a practice company.
    prisma.user.findMany({
      where: { canSignIn: true, organization: { practice: true } },
      orderBy: { createdAt: "desc" }, take: 500,
      select: {
        id: true, name: true, email: true, createdAt: true, labAccess: true,
        organization: { select: { name: true, labLevel: true, _count: { select: { labTaskCompletions: true } } } },
        labCertificates: { select: { id: true } },
      },
    }),
  ]);

  return (
    <AdminClient
      codes={codes.map((c) => ({
        id: c.id, code: c.code, plan: c.plan, months: c.months, seats: c.seats, used: c.used, buyer: c.buyer,
        managerEmail: c.managerEmail, note: c.note, disabled: c.disabled, createdAt: c.createdAt.toISOString(),
        redeemBy: c.redeemBy?.toISOString() ?? null, redeemedBy: c.redemptions.map((r) => r.user.email),
      }))}
      learners={learners.map((u) => ({
        name: u.name, email: u.email, joined: u.createdAt.toISOString(),
        plan: u.labAccess && u.labAccess.expiresAt > new Date() ? u.labAccess.plan : "free",
        expiresAt: u.labAccess?.expiresAt.toISOString() ?? null,
        company: u.organization.name, level: u.organization.labLevel ?? "",
        tasksDone: u.organization._count.labTaskCompletions, certificates: u.labCertificates.length,
      }))}
    />
  );
}
