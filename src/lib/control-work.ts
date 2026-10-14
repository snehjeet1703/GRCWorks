import { prisma } from "@/lib/db";
import { computeEvidenceStatus } from "@/lib/evidence-status";
import { sendControlAssignedEmail } from "@/lib/email";

// Why an owned control still needs work. A control is only "closed" once it's implemented
// AND backed by at least one evidence file that is still valid.
export type ControlWorkReason = "NOT_STARTED" | "IN_PROGRESS" | "NEEDS_EVIDENCE";

export type ControlWorkItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  reason: ControlWorkReason;
  owner: { id: string; name: string } | null;
  validEvidence: number;
  totalEvidence: number;
  // Soonest expiry among valid evidence, so owners can see renewals coming.
  nextExpiry: string | null;
  frameworks: string[];
};

const usableStatus = new Set(["VALID", "EXPIRING"]);

export async function pendingControlWork(
  organizationId: string,
  ownerId?: string
): Promise<ControlWorkItem[]> {
  const now = new Date();
  const controls = await prisma.control.findMany({
    where: {
      organizationId,
      ownerId: ownerId ?? { not: null },
      status: { not: "NOT_APPLICABLE" },
      applicability: { not: "NOT_APPLICABLE" },
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      owner: { select: { id: true, name: true } },
      evidenceLinks: { select: { evidence: { select: { status: true, validFrom: true, validUntil: true } } } },
      mappings: { select: { requirement: { select: { framework: { select: { name: true } } } } } },
    },
    orderBy: { code: "asc" },
  });

  const items: ControlWorkItem[] = [];
  for (const c of controls) {
    const evidence = c.evidenceLinks.map((l) => l.evidence);
    const valid = evidence.filter((e) => usableStatus.has(computeEvidenceStatus(e, now)));
    let reason: ControlWorkReason | null = null;
    if (c.status === "NOT_STARTED") reason = "NOT_STARTED";
    else if (c.status === "IN_PROGRESS") reason = "IN_PROGRESS";
    else if (c.status === "IMPLEMENTED" && valid.length === 0) reason = "NEEDS_EVIDENCE";
    if (!reason) continue;

    const expiries = valid.map((e) => e.validUntil).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    items.push({
      id: c.id,
      code: c.code,
      title: c.title,
      status: c.status,
      reason,
      owner: c.owner,
      validEvidence: valid.length,
      totalEvidence: evidence.length,
      nextExpiry: expiries[0]?.toISOString() ?? null,
      frameworks: [...new Set(c.mappings.map((m) => m.requirement.framework.name))].sort(),
    });
  }
  return items;
}

export async function pendingControlCount(organizationId: string, ownerId: string) {
  return (await pendingControlWork(organizationId, ownerId)).length;
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
