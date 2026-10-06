import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePagePermission } from "@/lib/page-auth";
import { EvidenceClient } from "./evidence-client";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ controlId?: string }>;
}) {
  await requirePagePermission("evidence:read");
  const { controlId } = await searchParams;
  const session = await getServerSession(authOptions);
  const orgId = session!.user.organizationId;

  const [evidence, rawControls, frameworks, policies] = await Promise.all([
    prisma.evidence.findMany({
      where: {
        control: { organizationId: orgId },
        ...(controlId ? { controlId } : {}),
      },
      include: {
        control: { select: { id: true, code: true, title: true } },
        uploadedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        policy: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.control.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        code: true,
        title: true,
        mappings: {
          select: {
            requirement: {
              select: {
                framework: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.framework.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.policy.findMany({
      where: { organizationId: orgId },
      select: { id: true, title: true, status: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const controls = rawControls.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    frameworkIds: [...new Set(c.mappings.map((m) => m.requirement.framework.id))],
  }));

  const permissions = (session!.user as any).permissions ?? [];

  return (
    <EvidenceClient
      initialEvidence={evidence.map((e) => ({
        id: e.id,
        type: e.type,
        fileName: e.fileName,
        fileSize: e.fileSize,
        description: e.description,
        notes: e.notes,
        status: e.status,
        validFrom: e.validFrom?.toISOString() ?? null,
        validUntil: e.validUntil?.toISOString() ?? null,
        reviewedAt: e.reviewedAt?.toISOString() ?? null,
        reviewedBy: e.reviewedBy,
        createdAt: e.createdAt.toISOString(),
        control: e.control,
        uploadedBy: e.uploadedBy,
        policy: e.policy,
      }))}
      controls={controls}
      frameworks={frameworks}
      policies={policies}
      preselectedControlId={controlId ?? null}
      canEdit={permissions.includes("evidence:upload")}
      canReview={permissions.includes("evidence:review")}
    />
  );
}
