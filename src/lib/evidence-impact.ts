import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeEvidenceStatus } from "@/lib/evidence-status";
import { periodCoverage } from "@/lib/audit-periods";

// What removing a piece of evidence from controls (deleting it, or unlinking it) undoes:
// controls closed on it and audit slots approved or under review on it.

export type ReopenedSlot = {
  periodId: string; periodName: string; periodClosed: boolean;
  controlId: string; code: string; slotIndex: number; label: string; status: string;
};
export type EvidenceRemovalImpact = {
  controls: { id: string; code: string; title: string }[];
  slots: ReopenedSlot[];
  // Approved evidence in an audit period that has ended: only admins may remove it.
  protected: boolean;
};

const DECIDED = new Set(["APPROVED", "IN_REVIEW", "CHANGES_REQUESTED"]);

export async function evidenceRemovalImpact(
  organizationId: string, evidenceId: string, controlIds: string[]
): Promise<EvidenceRemovalImpact> {
  if (controlIds.length === 0) return { controls: [], slots: [], protected: false };
  const now = new Date();

  // Implemented controls left with no other valid evidence.
  const controls = await prisma.control.findMany({
    where: { id: { in: controlIds }, organizationId, status: "IMPLEMENTED" },
    select: {
      id: true, code: true, title: true,
      evidenceLinks: {
        where: { evidenceId: { not: evidenceId } },
        select: { evidence: { select: { status: true, validFrom: true, validUntil: true } } },
      },
    },
  });
  const reopenControls = controls
    .filter((c) => !c.evidenceLinks.some((l) => !["EXPIRED", "REJECTED"].includes(computeEvidenceStatus(l.evidence, now))))
    .map(({ id, code, title }) => ({ id, code, title }));

  // Audit slots whose only evidence is this file and that have an approval decision on them.
  const periods = await prisma.auditPeriod.findMany({
    where: { organizationId, scope: { some: { controlId: { in: controlIds } } } },
    select: { id: true },
  });
  const slots: ReopenedSlot[] = [];
  for (const { id } of periods) {
    const cov = await periodCoverage(organizationId, id);
    if (!cov) continue;
    const closed = new Date(cov.period.endDate) < now;
    for (const c of cov.controls) {
      if (!controlIds.includes(c.id)) continue;
      for (const s of c.slots) {
        if (!DECIDED.has(s.status)) continue;
        if (s.evidence.some((e) => e.id === evidenceId) && s.evidence.every((e) => e.id === evidenceId)) {
          slots.push({
            periodId: id, periodName: cov.period.name, periodClosed: closed,
            controlId: c.id, code: c.code, slotIndex: s.index, label: s.label, status: s.status,
          });
        }
      }
    }
  }

  return {
    controls: reopenControls,
    slots,
    protected: slots.some((s) => s.periodClosed && s.status === "APPROVED"),
  };
}

/** Reopens what the removal undoes. Runs inside the caller's transaction. */
export async function applyEvidenceRemoval(tx: Prisma.TransactionClient, impact: EvidenceRemovalImpact) {
  for (const s of impact.slots) {
    await tx.evidenceSlotReview.deleteMany({
      where: { auditPeriodId: s.periodId, controlId: s.controlId, slotIndex: s.slotIndex },
    });
  }
  if (impact.controls.length) {
    await tx.control.updateMany({
      where: { id: { in: impact.controls.map((c) => c.id) }, status: "IMPLEMENTED" },
      data: { status: "IN_PROGRESS", reviewState: "NONE", reviewNote: "" },
    });
  }
}

/** Short summary for audit logs. */
export const impactSummary = (impact: EvidenceRemovalImpact) => ({
  controlsReopened: impact.controls.map((c) => c.code),
  auditSlotsReopened: impact.slots.map((s) => `${s.periodName} · ${s.code} · ${s.label} (was ${s.status})`),
});
