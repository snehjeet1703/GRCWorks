import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeEvidenceStatus } from "@/lib/evidence-status";
import { sendControlAssignedEmail } from "@/lib/email";
import { PERMISSIONS, hasPermission, resolvePermissions } from "@/lib/permissions";

// Why an owned control still needs work. A control is only "closed" once it's implemented
// AND backed by at least one evidence file that is still valid.
//   IN_REVIEW          submitted, waiting on a reviewer (nothing for the owner to do)
//   CHANGES_REQUESTED  a reviewer sent it back with a note
export type ControlWorkReason = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "CHANGES_REQUESTED" | "NEEDS_EVIDENCE";

export type ControlEvidenceSummary = { id: string; fileName: string; type: string; status: string; validUntil: string | null };

export type ControlWorkItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  reason: ControlWorkReason;
  owner: { id: string; name: string } | null;
  submittedBy: { id: string; name: string } | null;
  submittedAt: string | null;
  reviewNote: string;
  validEvidence: number;
  totalEvidence: number;
  // Soonest expiry among valid evidence, so owners can see renewals coming.
  nextExpiry: string | null;
  frameworks: string[];
  evidence: ControlEvidenceSummary[];
};

const usableStatus = new Set(["VALID", "EXPIRING"]);

const workSelect = {
  id: true,
  code: true,
  title: true,
  status: true,
  reviewState: true,
  reviewNote: true,
  reviewSubmittedAt: true,
  owner: { select: { id: true, name: true } },
  reviewSubmittedBy: { select: { id: true, name: true } },
  evidenceLinks: {
    select: { evidence: { select: { id: true, fileName: true, type: true, status: true, validFrom: true, validUntil: true } } },
    orderBy: { evidence: { createdAt: "desc" as const } },
  },
  mappings: { select: { requirement: { select: { framework: { select: { name: true } } } } } },
};

type WorkRow = Awaited<ReturnType<typeof loadRows>>[number];
function loadRows(where: Prisma.ControlWhereInput) {
  return prisma.control.findMany({ where, select: workSelect, orderBy: { code: "asc" } });
}

function toItem(c: WorkRow, reason: ControlWorkReason, now: Date): ControlWorkItem {
  const evidence = c.evidenceLinks.map((l) => l.evidence);
  const withStatus = evidence.map((e) => ({ ...e, computed: computeEvidenceStatus(e, now) }));
  const valid = withStatus.filter((e) => usableStatus.has(e.computed));
  const expiries = valid.map((e) => e.validUntil).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    status: c.status,
    reason,
    owner: c.owner,
    submittedBy: c.reviewSubmittedBy,
    submittedAt: c.reviewSubmittedAt?.toISOString() ?? null,
    reviewNote: c.reviewNote,
    validEvidence: valid.length,
    totalEvidence: evidence.length,
    nextExpiry: expiries[0]?.toISOString() ?? null,
    frameworks: [...new Set(c.mappings.map((m) => m.requirement.framework.name))].sort(),
    evidence: withStatus.map((e) => ({
      id: e.id, fileName: e.fileName, type: e.type, status: e.computed, validUntil: e.validUntil?.toISOString() ?? null,
    })),
  };
}

// Controls with an owner that aren't closed yet: one owner's, or everyone's when ownerId is omitted.
export async function pendingControlWork(organizationId: string, ownerId?: string): Promise<ControlWorkItem[]> {
  const now = new Date();
  const rows = await loadRows({
    organizationId,
    ownerId: ownerId ?? { not: null },
    status: { not: "NOT_APPLICABLE" },
    applicability: { not: "NOT_APPLICABLE" },
  });

  const items: ControlWorkItem[] = [];
  for (const c of rows) {
    const hasValid = c.evidenceLinks.some((l) => usableStatus.has(computeEvidenceStatus(l.evidence, now)));
    let reason: ControlWorkReason | null = null;
    if (c.reviewState === "PENDING") reason = "IN_REVIEW";
    else if (c.reviewState === "CHANGES_REQUESTED") reason = "CHANGES_REQUESTED";
    else if (c.status === "NOT_STARTED") reason = "NOT_STARTED";
    else if (c.status === "IN_PROGRESS") reason = "IN_PROGRESS";
    else if (c.status === "IMPLEMENTED" && !hasValid) reason = "NEEDS_EVIDENCE";
    if (reason) items.push(toItem(c, reason, now));
  }
  return items;
}

// Controls waiting for this reviewer: submitted, and neither owned nor submitted by them.
export async function controlReviewQueue(organizationId: string, reviewerId: string): Promise<ControlWorkItem[]> {
  const now = new Date();
  const rows = await loadRows({
    organizationId,
    reviewState: "PENDING",
    NOT: [{ ownerId: reviewerId }, { reviewSubmittedById: reviewerId }],
  });
  return rows.map((c) => toItem(c, "IN_REVIEW", now));
}

// Everyone in the organisation who can approve controls ("Review evidence").
export async function controlReviewers(organizationId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, role: true, customRole: { select: { name: true, permissions: true } } },
  });
  return users
    .filter((u) => hasPermission(resolvePermissions(u), PERMISSIONS.EVIDENCE_REVIEW))
    .map(({ id, name, email }) => ({ id, name, email }));
}

// Emails a control's new owner; never fails the request, and skips people assigning themselves.
export async function notifyControlOwner(controlId: string, assignerId: string, assignerName: string, baseUrl: string) {
  try {
    const c = await prisma.control.findUnique({
      where: { id: controlId },
      select: {
        code: true, title: true, owner: true,
        mappings: { select: { requirement: { select: { framework: { select: { name: true } } } } } },
      },
    });
    if (!c?.owner || c.owner.id === assignerId) return;
    await sendControlAssignedEmail(c.owner.email, {
      ownerName: c.owner.name,
      assignerName,
      code: c.code,
      title: c.title,
      frameworks: [...new Set(c.mappings.map((m) => m.requirement.framework.name))].sort(),
      link: `${baseUrl}/tasks`,
    });
  } catch (err) {
    console.error("[controls] owner email failed:", err);
  }
}

// The owner of a control may work on it (evidence, status) even without broader edit rights.
export async function ownsAllControls(userId: string, organizationId: string, controlIds: string[]) {
  if (controlIds.length === 0) return false;
  const owned = await prisma.control.count({
    where: { id: { in: controlIds }, organizationId, ownerId: userId },
  });
  return owned === new Set(controlIds).size;
}
