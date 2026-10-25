import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTemplate, labContent, labMode, templateIdOf } from "@/lib/lab/content";
import { isLabAdmin, labSettings, ownerAdmins } from "@/lib/lab/access";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

const DAY = 86400000;

// Lab command centre: overview, "I've paid" approvals, learners, access codes and settings.
export default async function LabAdminPage() {
  if (!labMode) notFound();
  const session = await getServerSession(authOptions);
  const me = await prisma.user.findUnique({ where: { id: (session!.user as any).id }, select: { email: true } });
  if (!(await isLabAdmin(me?.email))) notFound();

  const now = new Date();
  const [codes, learners, requests, settings, content, certificates] = await Promise.all([
    prisma.labAccessCode.findMany({
      orderBy: { createdAt: "desc" }, take: 300,
      include: { redemptions: { include: { user: { select: { email: true } } } } },
    }),
    // Learners are the people who can (or could, before being blocked) sign in to a practice company.
    prisma.user.findMany({
      where: { passwordHash: { not: null }, organization: { practice: true } },
      orderBy: { createdAt: "desc" }, take: 1000,
      select: {
        id: true, name: true, email: true, createdAt: true, canSignIn: true, labAccess: true,
        organization: { select: { name: true, labLevel: true, labTemplate: true, _count: { select: { labTaskCompletions: true } } } },
        labCertificates: { select: { id: true } },
      },
    }),
    prisma.labAccessRequest.findMany({
      orderBy: { createdAt: "desc" }, take: 200,
      include: { user: { select: { name: true, email: true, labAccess: { select: { plan: true, expiresAt: true } } } } },
    }),
    labSettings(),
    labContent(),
    prisma.labCertificate.findMany({ select: { industry: true, level: true } }),
  ]);

  const industryOf = new Map<string, string>();
  for (const t of content.templates.values()) industryOf.set(t.id, t.company.industry);
  const learnerRows = await Promise.all(learners.map(async (u) => {
    const tid = templateIdOf(u.organization.labTemplate);
    const paid = !!u.labAccess && u.labAccess.expiresAt > now;
    return {
      name: u.name, email: u.email, joined: u.createdAt.toISOString(), blocked: !u.canSignIn,
      plan: paid ? u.labAccess!.plan : "free", expiresAt: u.labAccess?.expiresAt.toISOString() ?? null,
      industry: (tid && (industryOf.get(tid) ?? (await getTemplate(tid))?.company.industry)) || u.organization.name,
      company: u.organization.name, level: u.organization.labLevel ?? "",
      tasksDone: u.organization._count.labTaskCompletions, certificates: u.labCertificates.length,
    };
  }));

  const count = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));
  };
  const overview = {
    learners: learnerRows.length,
    paid: learnerRows.filter((l) => l.plan !== "free").length,
    signups7: learners.filter((u) => now.getTime() - u.createdAt.getTime() < 7 * DAY).length,
    signups30: learners.filter((u) => now.getTime() - u.createdAt.getTime() < 30 * DAY).length,
    pending: requests.filter((r) => r.status === "PENDING").length,
    certificates: certificates.length,
    expiring: learnerRows
      .filter((l) => l.plan !== "free" && l.expiresAt && new Date(l.expiresAt).getTime() - now.getTime() < 30 * DAY)
      .map((l) => ({ name: l.name, email: l.email, plan: l.plan, expiresAt: l.expiresAt! })),
    byIndustry: count(learnerRows, (l) => l.industry).slice(0, 12),
    byLevel: count(learnerRows, (l) => l.level || "practitioner"),
    certsByIndustry: count(certificates, (c) => c.industry).slice(0, 12),
  };

  return (
    <AdminClient
      overview={overview}
      requests={requests.map((r) => ({
        id: r.id, name: r.user.name, email: r.user.email, plan: r.plan, reference: r.reference, amount: r.amount, note: r.note,
        status: r.status, createdAt: r.createdAt.toISOString(), decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionNote: r.decisionNote,
        currentAccess: r.user.labAccess && r.user.labAccess.expiresAt > now ? `${r.user.labAccess.plan} until ${r.user.labAccess.expiresAt.toISOString().slice(0, 10)}` : null,
      }))}
      learners={learnerRows}
      codes={codes.map((c) => ({
        id: c.id, code: c.code, plan: c.plan, months: c.months, seats: c.seats, used: c.used, buyer: c.buyer,
        managerEmail: c.managerEmail, note: c.note, disabled: c.disabled, createdAt: c.createdAt.toISOString(),
        redeemBy: c.redeemBy?.toISOString() ?? null, redeemedBy: c.redemptions.map((r) => r.user.email),
      }))}
      settings={settings}
      owners={ownerAdmins()}
      courses={content.courses.map((c) => ({ id: c.id, title: c.title, defaultFree: c.freeLabs, labs: c.labs.map((l) => ({ id: l.id, title: l.title })) }))}
    />
  );
}
