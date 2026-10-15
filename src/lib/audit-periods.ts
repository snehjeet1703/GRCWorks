import { z } from "zod";
import type { ControlFrequency, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";

// ─── Slots ───────────────────────────────────────────────────
// An audit period is split per control by its frequency. Monthly (and weekly/daily, which auditors
// sample monthly) → one slot per month; quarterly → one per quarter; everything else → the whole period.

export type Slot = { index: number; label: string; start: Date; end: Date };

const DAY = 86_400_000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Dates are calendar days; a period/slot runs from 00:00 UTC on its first day to 23:59:59.999 UTC on its last.
export const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayEnd = (d: Date) => new Date(dayStart(d).getTime() + DAY - 1);
// Clamped so a period starting on the 31st steps to the last day of shorter months, not into the next one.
const addMonths = (d: Date, n: number) => {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
};
const monthLabel = (d: Date) => `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export function slotMonths(frequency: string): number | null {
  if (frequency === "MONTHLY" || frequency === "WEEKLY" || frequency === "DAILY") return 1;
  if (frequency === "QUARTERLY") return 3;
  return null; // ANNUALLY, CONTINUOUS, AS_NEEDED: evidence once per period
}

export function slotsFor(frequency: string, periodStart: Date, periodEnd: Date): Slot[] {
  const start = dayStart(periodStart);
  const end = dayEnd(periodEnd);
  const step = slotMonths(frequency);
  if (!step) return [{ index: 0, label: "Full period", start, end }];

  const slots: Slot[] = [];
  for (let i = 0, s = start; s <= end; i++, s = addMonths(start, i * step)) {
    const next = addMonths(start, (i + 1) * step);
    const slotEnd = new Date(Math.min(next.getTime() - 1, end.getTime()));
    const label = step === 1
      ? monthLabel(s)
      : s.getUTCFullYear() === slotEnd.getUTCFullYear()
        ? `Q${i + 1} (${MONTH_NAMES[s.getUTCMonth()]}–${MONTH_NAMES[slotEnd.getUTCMonth()]} ${slotEnd.getUTCFullYear()})`
        : `Q${i + 1} (${monthLabel(s)}–${monthLabel(slotEnd)})`;
    slots.push({ index: i, label, start: s, end: slotEnd });
  }
  return slots;
}

// ─── Slot status ─────────────────────────────────────────────

export type SlotStatus =
  | "UPCOMING"          // hasn't started; uploads aren't allowed yet
  | "DUE"               // running, no evidence yet
  | "OVERDUE"           // ended without evidence
  | "READY"             // evidence uploaded, not yet submitted
  | "IN_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED";

// Statuses where the owner has something to do.
export const OWNER_ACTION: SlotStatus[] = ["DUE", "OVERDUE", "READY", "CHANGES_REQUESTED"];

export type SlotEvidence = {
  id: string; fileName: string; type: string; status: string;
  createdAt: string; uploadedBy: string | null; reviewedBy: string | null; reviewedAt: string | null;
};

export type SlotView = {
  index: number; label: string; start: string; end: string; status: SlotStatus;
  evidence: SlotEvidence[];
  note: string; submittedBy: string | null; submittedAt: string | null; reviewedBy: string | null; reviewedAt: string | null;
};

export type ControlCoverage = {
  id: string; code: string; title: string; frequency: string;
  owner: { id: string; name: string } | null;
  requirements: string[];
  slots: SlotView[];
};

type EvidenceRow = {
  id: string; fileName: string; type: string; status: string; createdAt: Date; periodStart: Date | null;
  uploadedBy: { name: string } | null; reviewedBy: { name: string } | null; reviewedAt: Date | null;
};
type ReviewRow = {
  slotIndex: number; status: "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED"; note: string;
  submittedAt: Date | null; reviewedAt: Date | null;
  submittedBy: { name: string } | null; reviewedBy: { name: string } | null;
};

export function evaluateSlot(
  slot: Slot, evidence: EvidenceRow[], review: ReviewRow | undefined, approvalRequired: boolean, now: Date
): SlotView {
  // Evidence counts for a slot when the period it covers starts inside the slot; rejected files don't count.
  const inSlot = evidence.filter(
    (e) => e.status !== "REJECTED" && e.periodStart && e.periodStart >= slot.start && e.periodStart <= slot.end
  );
  let status: SlotStatus;
  if (slot.start > now) status = "UPCOMING";
  else if (review?.status === "APPROVED") status = "APPROVED";
  else if (review?.status === "IN_REVIEW") status = "IN_REVIEW";
  else if (review?.status === "CHANGES_REQUESTED") status = "CHANGES_REQUESTED";
  else if (inSlot.length > 0) status = approvalRequired ? "READY" : "APPROVED";
  else status = slot.end < now ? "OVERDUE" : "DUE";

  return {
    index: slot.index, label: slot.label, start: slot.start.toISOString(), end: slot.end.toISOString(), status,
    evidence: inSlot.map((e) => ({
      id: e.id, fileName: e.fileName, type: e.type, status: e.status, createdAt: e.createdAt.toISOString(),
      uploadedBy: e.uploadedBy?.name ?? null, reviewedBy: e.reviewedBy?.name ?? null, reviewedAt: e.reviewedAt?.toISOString() ?? null,
    })),
    note: review?.note ?? "",
    submittedBy: review?.submittedBy?.name ?? null,
    submittedAt: review?.submittedAt?.toISOString() ?? null,
    reviewedBy: review?.reviewedBy?.name ?? null,
    reviewedAt: review?.reviewedAt?.toISOString() ?? null,
  };
}

// ─── Coverage for one audit period ───────────────────────────

const controlScopeSelect = {
  id: true, code: true, title: true, frequency: true,
  owner: { select: { id: true, name: true } },
  mappings: { select: { requirement: { select: { code: true, frameworkId: true } } } },
  evidenceLinks: {
    select: {
      evidence: {
        select: {
          id: true, fileName: true, type: true, status: true, createdAt: true, periodStart: true, reviewedAt: true,
          uploadedBy: { select: { name: true } }, reviewedBy: { select: { name: true } },
        },
      },
    },
  },
} as const;

// Controls a new period covers by default: mapped to the framework and applicable.
const frameworkScopeWhere = (organizationId: string, frameworkId: string) => ({
  organizationId,
  applicability: { not: "NOT_APPLICABLE" as const },
  mappings: { some: { requirement: { frameworkId } } },
});

type Tx = Prisma.TransactionClient;

/**
 * Saves which controls a period covers, with their current frequencies. Without controlIds, it takes every
 * applicable control mapped to the period's framework. Existing entries are left alone.
 */
export async function addToScope(
  tx: Tx, organizationId: string, periodId: string, frameworkId: string,
  controlIds?: string[], frequencyOverride?: Map<string, ControlFrequency>
) {
  const controls = await tx.control.findMany({
    where: { ...frameworkScopeWhere(organizationId, frameworkId), ...(controlIds ? { id: { in: controlIds } } : {}) },
    select: { id: true, frequency: true },
  });
  if (!controls.length) return 0;
  const res = await tx.auditPeriodControl.createMany({
    data: controls.map((c) => ({ auditPeriodId: periodId, controlId: c.id, frequency: frequencyOverride?.get(c.id) ?? c.frequency })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Applicable controls mapped to the framework that this period doesn't cover (e.g. added after it was created). */
export async function controlsOutsideScope(organizationId: string, periodId: string, frameworkId: string) {
  return prisma.control.findMany({
    where: { ...frameworkScopeWhere(organizationId, frameworkId), auditScopes: { none: { auditPeriodId: periodId } } },
    select: { id: true, code: true, title: true },
    orderBy: { code: "asc" },
  });
}

// In-scope controls: the ones saved for this period, while still applicable.
export async function periodCoverage(organizationId: string, periodId: string, ownerId?: string) {
  const period = await prisma.auditPeriod.findFirst({
    where: { id: periodId, organizationId },
    include: {
      framework: { select: { id: true, name: true } },
      organization: { select: { controlApprovalRequired: true } },
      slotReviews: {
        include: { submittedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
      },
    },
  });
  if (!period) return null;

  const scope = await prisma.auditPeriodControl.findMany({
    where: {
      auditPeriodId: period.id,
      control: {
        organizationId,
        applicability: { not: "NOT_APPLICABLE" },
        status: { not: "NOT_APPLICABLE" },
        ...(ownerId ? { ownerId } : {}),
      },
    },
    select: { frequency: true, control: { select: controlScopeSelect } },
  });
  // The period's own frequency, not the control's current default: past periods keep their slots.
  const controls = scope
    .map((s) => ({ ...s.control, frequency: s.frequency }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const now = new Date();
  const rows: ControlCoverage[] = controls.map((c) => {
    const evidence = c.evidenceLinks.map((l) => l.evidence);
    const reviews = period.slotReviews.filter((r) => r.controlId === c.id);
    return {
      id: c.id, code: c.code, title: c.title, frequency: c.frequency, owner: c.owner,
      requirements: c.mappings.filter((m) => m.requirement.frameworkId === period.frameworkId).map((m) => m.requirement.code),
      slots: slotsFor(c.frequency, period.startDate, period.endDate).map((slot) =>
        evaluateSlot(slot, evidence, reviews.find((r) => r.slotIndex === slot.index), period.organization.controlApprovalRequired, now)
      ),
    };
  });

  const counts = { total: 0, approved: 0, inReview: 0, ready: 0, changesRequested: 0, due: 0, overdue: 0, upcoming: 0 };
  for (const r of rows) for (const s of r.slots) {
    counts.total++;
    if (s.status === "APPROVED") counts.approved++;
    else if (s.status === "IN_REVIEW") counts.inReview++;
    else if (s.status === "READY") counts.ready++;
    else if (s.status === "CHANGES_REQUESTED") counts.changesRequested++;
    else if (s.status === "DUE") counts.due++;
    else if (s.status === "OVERDUE") counts.overdue++;
    else counts.upcoming++;
  }

  return {
    period: {
      id: period.id, name: period.name, startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(),
      framework: period.framework, approvalRequired: period.organization.controlApprovalRequired,
    },
    controls: rows,
    counts,
  };
}

// ─── Work lists for Tasks ────────────────────────────────────

export type SlotWorkItem = {
  periodId: string; periodName: string; periodEnd: string;
  control: { id: string; code: string; title: string };
  owner: { id: string; name: string } | null;
  slot: SlotView;
};

// Periods still collecting evidence: started, and not ended more than 30 days ago (late uploads).
async function livePeriods(organizationId: string) {
  const now = new Date();
  return prisma.auditPeriod.findMany({
    where: { organizationId, startDate: { lte: now }, endDate: { gte: new Date(now.getTime() - 30 * DAY) } },
    select: { id: true },
  });
}

// Slots the owner must act on (or that are waiting on a reviewer) across live audit periods.
export async function slotWorkForOwner(organizationId: string, ownerId: string): Promise<SlotWorkItem[]> {
  const items: SlotWorkItem[] = [];
  for (const { id } of await livePeriods(organizationId)) {
    const cov = await periodCoverage(organizationId, id, ownerId);
    if (!cov) continue;
    for (const c of cov.controls) for (const slot of c.slots) {
      if (slot.status === "UPCOMING" || slot.status === "APPROVED") continue;
      items.push({
        periodId: id, periodName: cov.period.name, periodEnd: cov.period.endDate,
        control: { id: c.id, code: c.code, title: c.title }, owner: c.owner, slot,
      });
    }
  }
  return items;
}

// Slots submitted for review that this reviewer may decide (not their own control or submission).
export async function slotReviewQueue(organizationId: string, reviewerId: string): Promise<SlotWorkItem[]> {
  const pending = await prisma.evidenceSlotReview.findMany({
    where: {
      status: "IN_REVIEW",
      auditPeriod: { organizationId },
      NOT: [{ submittedById: reviewerId }, { control: { ownerId: reviewerId } }],
    },
    select: { auditPeriodId: true, controlId: true, slotIndex: true },
  });
  const items: SlotWorkItem[] = [];
  for (const periodId of [...new Set(pending.map((p) => p.auditPeriodId))]) {
    const cov = await periodCoverage(organizationId, periodId);
    if (!cov) continue;
    for (const p of pending.filter((x) => x.auditPeriodId === periodId)) {
      const c = cov.controls.find((x) => x.id === p.controlId);
      const slot = c?.slots.find((s) => s.index === p.slotIndex);
      if (c && slot) {
        items.push({
          periodId, periodName: cov.period.name, periodEnd: cov.period.endDate,
          control: { id: c.id, code: c.code, title: c.title }, owner: c.owner, slot,
        });
      }
    }
  }
  return items;
}

// Resolves the slot an upload or review refers to, checking the control is in the period's scope.
export async function resolveSlot(organizationId: string, periodId: string, controlId: string, slotIndex: number) {
  const period = await prisma.auditPeriod.findFirst({ where: { id: periodId, organizationId } });
  if (!period) return null;
  const scoped = await prisma.auditPeriodControl.findFirst({
    where: { auditPeriodId: period.id, controlId, control: { organizationId, applicability: { not: "NOT_APPLICABLE" } } },
    select: { frequency: true, control: { select: { id: true, code: true, title: true, ownerId: true } } },
  });
  if (!scoped) return null;
  const control = { ...scoped.control, frequency: scoped.frequency };
  const slot = slotsFor(control.frequency, period.startDate, period.endDate).find((s) => s.index === slotIndex);
  return slot ? { period, control, slot } : null;
}

// ─── Create / edit input ─────────────────────────────────────

export const periodSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  frameworkId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
}).strict();

export function parsePeriodDates(startDate: string, endDate: string) {
  const start = dayStart(new Date(`${startDate}T00:00:00Z`));
  const end = dayEnd(new Date(`${endDate}T00:00:00Z`));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new HttpError(400, "Invalid dates");
  if (end <= start) throw new HttpError(400, "The end date must be after the start date");
  if (end.getTime() - start.getTime() > 3 * 366 * 86_400_000) throw new HttpError(400, "An audit period can be at most 3 years");
  return { start, end };
}
