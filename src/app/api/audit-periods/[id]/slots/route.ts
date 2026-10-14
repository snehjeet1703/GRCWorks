import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requireSession, userHasPermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { controlReviewers } from "@/lib/control-work";
import { resolveSlot } from "@/lib/audit-periods";
import { sendControlReviewDecisionEmail, sendControlReviewRequestEmail } from "@/lib/email";
import { portalBaseUrl } from "@/lib/vendor-portal";

const schema = z.object({
  controlId: z.string().uuid(),
  slotIndex: z.number().int().min(0).max(400),
  action: z.enum(["submit", "withdraw", "approve", "reject"]),
  note: z.string().trim().max(2000).optional().default(""),
}).strict();

// Approval of one control's evidence for one slot of an audit period.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id: periodId } = await params;
    const { controlId, slotIndex, action, note: rawNote } = await parseBody(req, schema);
    const note = rawNote ?? "";

    const resolved = await resolveSlot(user.organizationId, periodId, controlId, slotIndex);
    if (!resolved) throw new HttpError(404, "That audit period slot doesn't exist");
    const { period, control, slot } = resolved;
    const now = new Date();
    if (slot.start > now) throw new HttpError(400, `${slot.label} hasn't started yet.`);

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId }, select: { controlApprovalRequired: true },
    });
    const approvalRequired = org?.controlApprovalRequired ?? true;
    const key = { auditPeriodId_controlId_slotIndex: { auditPeriodId: periodId, controlId, slotIndex } };
    const existing = await prisma.evidenceSlotReview.findUnique({
      where: key, include: { submittedBy: { select: { id: true, name: true, email: true } } },
    });
    const evidence = await prisma.evidence.findMany({
      where: {
        controls: { some: { controlId } },
        status: { not: "REJECTED" },
        periodStart: { gte: slot.start, lte: slot.end },
      },
      select: { id: true, reviewedById: true },
    });
    const label = `${control.code} ${control.title} · ${slot.label}`;
    const audit = (changes: Record<string, unknown>) => ({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "EvidenceSlot", entityId: `${periodId}:${controlId}:${slotIndex}`, entityName: `${period.name} · ${label}`,
      action: "UPDATE" as const, changes,
    });
    const baseUrl = portalBaseUrl(req);
    const isOwner = control.ownerId === user.id;

    if (action === "submit" || action === "withdraw") {
      if (!isOwner && !(await userHasPermission(user.id, PERMISSIONS.CONTROLS_WRITE))) {
        throw new HttpError(403, `Only the control's owner or someone with the "Edit controls" permission can do this.`);
      }
    }

    if (action === "submit") {
      if (existing?.status === "APPROVED") throw new HttpError(400, "This period's evidence is already approved.");
      if (existing?.status === "IN_REVIEW") throw new HttpError(400, "This period's evidence is already waiting for review.");
      if (evidence.length === 0) throw new HttpError(400, `Upload evidence for ${slot.label} before submitting it.`);

      const status = approvalRequired ? "IN_REVIEW" : "APPROVED";
      await prisma.$transaction(async (tx) => {
        await tx.evidenceSlotReview.upsert({
          where: key,
          create: {
            auditPeriodId: periodId, controlId, slotIndex, status, note: "",
            submittedById: user.id, submittedAt: now,
            ...(approvalRequired ? {} : { reviewedAt: now }),
          },
          update: {
            status, note: "", submittedById: user.id, submittedAt: now,
            reviewedById: null, reviewedAt: approvalRequired ? null : now,
          },
        });
        await logAudit(audit({ slot: { from: existing?.status ?? "OPEN", to: status }, evidenceFiles: evidence.length }), tx);
      });
      if (approvalRequired) {
        try {
          const reviewers = (await controlReviewers(user.organizationId)).filter(
            (r) => r.id !== user.id && r.id !== control.ownerId
          );
          await sendControlReviewRequestEmail(reviewers.map((r) => r.email), {
            submitterName: user.name, code: control.code, title: `${control.title} (${period.name}, ${slot.label})`,
            evidenceCount: evidence.length, link: `${baseUrl}/tasks`,
          });
        } catch (err) {
          console.error("[audit-periods] review request email failed:", err);
        }
      }
      return NextResponse.json({ status });
    }

    if (action === "withdraw") {
      if (existing?.status !== "IN_REVIEW") throw new HttpError(400, "This period's evidence isn't waiting for review.");
      await prisma.$transaction(async (tx) => {
        await tx.evidenceSlotReview.delete({ where: key });
        await logAudit(audit({ slot: { from: "IN_REVIEW", to: "WITHDRAWN" } }), tx);
      });
      return NextResponse.json({ status: "OPEN" });
    }

    // approve / reject
    if (!(await userHasPermission(user.id, PERMISSIONS.EVIDENCE_REVIEW))) {
      throw new HttpError(403, `Your role doesn't allow this. It needs the "Review evidence" permission; ask an admin.`);
    }
    if (existing?.status !== "IN_REVIEW") throw new HttpError(400, "This period's evidence isn't waiting for review.");
    if (isOwner || existing.submittedById === user.id) {
      throw new HttpError(403, "You can't review evidence for a control you own or submitted. Another reviewer needs to approve it.");
    }
    if (action === "reject" && !note) throw new HttpError(400, "Say what needs to change");

    await prisma.$transaction(async (tx) => {
      await tx.evidenceSlotReview.update({
        where: key,
        data: { status: action === "approve" ? "APPROVED" : "CHANGES_REQUESTED", note, reviewedById: user.id, reviewedAt: now },
      });
      if (action === "approve") {
        await tx.evidence.updateMany({
          where: { id: { in: evidence.filter((e) => !e.reviewedById).map((e) => e.id) } },
          data: { status: "VALID", reviewedById: user.id, reviewedAt: now },
        });
        // Approved operating evidence shows the control is in place.
        await tx.control.updateMany({
          where: { id: controlId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, reviewState: "NONE" },
          data: { status: "IMPLEMENTED" },
        });
      }
      await logAudit(audit({ slot: { from: "IN_REVIEW", to: action === "approve" ? "APPROVED" : "CHANGES_REQUESTED" }, ...(note ? { note } : {}) }), tx);
    });

    const recipients = new Map<string, { name: string; email: string }>();
    const owner = control.ownerId
      ? await prisma.user.findUnique({ where: { id: control.ownerId }, select: { id: true, name: true, email: true } })
      : null;
    if (owner) recipients.set(owner.id, owner);
    if (existing.submittedBy) recipients.set(existing.submittedBy.id, existing.submittedBy);
    for (const r of recipients.values()) {
      try {
        await sendControlReviewDecisionEmail(r.email, {
          ownerName: r.name, reviewerName: user.name, code: control.code,
          title: `${control.title} (${period.name}, ${slot.label})`,
          approved: action === "approve", reason: note ?? "", link: `${baseUrl}/tasks`,
        });
      } catch (err) {
        console.error("[audit-periods] decision email failed:", err);
      }
    }
    return NextResponse.json({ status: action === "approve" ? "APPROVED" : "CHANGES_REQUESTED" });
  } catch (err) {
    return handleError(err);
  }
}
