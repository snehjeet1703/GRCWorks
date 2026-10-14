import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requireSession, userHasPermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/lib/evidence-status";
import { controlReviewers } from "@/lib/control-work";
import { sendControlReviewDecisionEmail, sendControlReviewRequestEmail } from "@/lib/email";
import { portalBaseUrl } from "@/lib/vendor-portal";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }).strict(),
  z.object({ action: z.literal("withdraw") }).strict(),
  z.object({ action: z.literal("approve"), note: z.string().max(2000).optional().default("") }).strict(),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(1, "Say what needs to change").max(2000) }).strict(),
]);

// Closing a control: the owner submits it with evidence; a reviewer who is neither the owner nor the
// submitter approves (→ IMPLEMENTED) or sends it back. With approval switched off, submit closes it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await parseBody(req, schema);

    const control = await prisma.control.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, code: true, title: true, status: true, ownerId: true,
        reviewState: true, reviewSubmittedById: true,
        owner: { select: { id: true, name: true, email: true } },
        reviewSubmittedBy: { select: { id: true, name: true, email: true } },
        organization: { select: { controlApprovalRequired: true } },
        evidenceLinks: { select: { evidence: { select: { id: true, status: true, validFrom: true, validUntil: true, reviewedById: true } } } },
      },
    });
    if (!control) throw new HttpError(404, "Control not found");

    const now = new Date();
    const validEvidence = control.evidenceLinks
      .map((l) => l.evidence)
      .filter((e) => ["VALID", "EXPIRING"].includes(computeEvidenceStatus(e, now)));
    const isOwner = control.ownerId === user.id;
    const label = `${control.code} ${control.title}`;
    const baseUrl = portalBaseUrl(req);

    const audit = (changes: Record<string, unknown>) => ({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "Control", entityId: id, entityName: label, action: "UPDATE" as const, changes,
    });

    if (body.action === "submit" || body.action === "withdraw") {
      if (!isOwner && !(await userHasPermission(user.id, PERMISSIONS.CONTROLS_WRITE))) {
        throw new HttpError(403, `Only the control's owner or someone with the "Edit controls" permission can do this.`);
      }
    }

    if (body.action === "submit") {
      if (control.status === "IMPLEMENTED" && validEvidence.length > 0) throw new HttpError(400, "This control is already implemented.");
      if (control.reviewState === "PENDING") throw new HttpError(400, "This control is already waiting for review.");
      if (validEvidence.length === 0) {
        throw new HttpError(400, "Upload at least one valid evidence file before submitting this control.");
      }

      // Approval switched off: the owner's submission closes the control straight away.
      if (!control.organization.controlApprovalRequired) {
        await prisma.$transaction(async (tx) => {
          await tx.control.update({ where: { id }, data: { status: "IMPLEMENTED", reviewState: "NONE", reviewNote: "" } });
          await logAudit(audit({ status: { from: control.status, to: "IMPLEMENTED" } }), tx);
        });
        return NextResponse.json({ status: "IMPLEMENTED", reviewState: "NONE" });
      }

      await prisma.$transaction(async (tx) => {
        await tx.control.update({
          where: { id },
          data: {
            status: "IN_PROGRESS", reviewState: "PENDING", reviewNote: "",
            reviewSubmittedAt: now, reviewSubmittedById: user.id,
          },
        });
        await logAudit(audit({ review: { from: control.reviewState, to: "PENDING" }, evidenceFiles: validEvidence.length }), tx);
      });
      try {
        const reviewers = (await controlReviewers(user.organizationId)).filter(
          (r) => r.id !== user.id && r.id !== control.ownerId
        );
        await sendControlReviewRequestEmail(reviewers.map((r) => r.email), {
          submitterName: user.name, code: control.code, title: control.title,
          evidenceCount: validEvidence.length, link: `${baseUrl}/tasks`,
        });
      } catch (err) {
        console.error("[controls] review request email failed:", err);
      }
      return NextResponse.json({ status: "IN_PROGRESS", reviewState: "PENDING" });
    }

    if (body.action === "withdraw") {
      if (control.reviewState !== "PENDING") throw new HttpError(400, "This control isn't waiting for review.");
      await prisma.$transaction(async (tx) => {
        await tx.control.update({ where: { id }, data: { reviewState: "NONE", reviewSubmittedAt: null, reviewSubmittedById: null } });
        await logAudit(audit({ review: { from: "PENDING", to: "WITHDRAWN" } }), tx);
      });
      return NextResponse.json({ status: control.status, reviewState: "NONE" });
    }

    // approve / reject
    if (!(await userHasPermission(user.id, PERMISSIONS.EVIDENCE_REVIEW))) {
      throw new HttpError(403, `Your role doesn't allow this. It needs the "Review evidence" permission; ask an admin.`);
    }
    if (control.reviewState !== "PENDING") throw new HttpError(400, "This control isn't waiting for review.");
    if (isOwner || control.reviewSubmittedById === user.id) {
      throw new HttpError(403, "You can't review a control you own or submitted. Another reviewer needs to approve it.");
    }

    const notify = async (approved: boolean, reason: string) => {
      const recipients = new Map<string, { name: string; email: string }>();
      if (control.owner) recipients.set(control.owner.id, control.owner);
      if (control.reviewSubmittedBy) recipients.set(control.reviewSubmittedBy.id, control.reviewSubmittedBy);
      for (const r of recipients.values()) {
        try {
          await sendControlReviewDecisionEmail(r.email, {
            ownerName: r.name, reviewerName: user.name, code: control.code, title: control.title,
            approved, reason, link: `${baseUrl}/tasks`,
          });
        } catch (err) {
          console.error("[controls] review decision email failed:", err);
        }
      }
    };

    if (body.action === "approve") {
      if (validEvidence.length === 0) {
        throw new HttpError(400, "The evidence has expired since it was submitted. Send it back so the owner can upload current evidence.");
      }
      await prisma.$transaction(async (tx) => {
        await tx.control.update({ where: { id }, data: { status: "IMPLEMENTED", reviewState: "NONE", reviewNote: body.note ?? "" } });
        // Approving the control counts as reviewing the evidence it was approved on.
        await tx.evidence.updateMany({
          where: { id: { in: validEvidence.filter((e) => !e.reviewedById).map((e) => e.id) } },
          data: { status: "VALID", reviewedById: user.id, reviewedAt: now },
        });
        await logAudit(audit({ status: { from: control.status, to: "IMPLEMENTED" }, review: { from: "PENDING", to: "APPROVED" }, ...(body.note ? { note: body.note } : {}) }), tx);
      });
      await notify(true, body.note ?? "");
      return NextResponse.json({ status: "IMPLEMENTED", reviewState: "NONE" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.control.update({ where: { id }, data: { status: "IN_PROGRESS", reviewState: "CHANGES_REQUESTED", reviewNote: body.note } });
      await logAudit(audit({ review: { from: "PENDING", to: "CHANGES_REQUESTED" }, note: body.note }), tx);
    });
    await notify(false, body.note);
    return NextResponse.json({ status: "IN_PROGRESS", reviewState: "CHANGES_REQUESTED" });
  } catch (err) {
    return handleError(err);
  }
}
