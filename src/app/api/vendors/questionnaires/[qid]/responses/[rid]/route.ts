import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { sendVendorInviteEmail } from "@/lib/email";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { inviteExpiry, portalBaseUrl } from "@/lib/vendor-portal";

const reviewSchema = z.object({
  reviewNotes: z.string().max(2000).optional().default(""),
  score: z.number().int().min(0).max(100).optional(),
}).strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qid: string; rid: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { qid, rid } = await params;
    const data = await parseBody(req, reviewSchema);
    const response = await prisma.$transaction(async (tx) => {
      const existing = await tx.questionnaireResponse.findUnique({
        where: { id: rid },
        include: { questionnaire: true, vendor: true },
      });
      if (!existing || existing.questionnaireId !== qid || existing.questionnaire.organizationId !== user.organizationId) {
        throw new HttpError(404, "Response not found");
      }
      if (existing.status !== "SUBMITTED") {
        throw new HttpError(400, "Response must be submitted before review");
      }
      const updated = await tx.questionnaireResponse.update({
        where: { id: rid },
        data: {
          status: "REVIEWED",
          reviewedAt: new Date(),
          reviewedBy: user.name,
          reviewNotes: data.reviewNotes,
          score: data.score,
        },
      });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "questionnaireresponse",
        entityId: rid,
        entityName: `${existing.vendor.name} - ${existing.questionnaire.title}`,
        action: "UPDATE",
        afterJson: { status: "REVIEWED", score: data.score },
      }, tx);
      return updated;
    });
    const { inviteTokenHash, otpHash, ...safe } = response;
    return NextResponse.json(safe);
  } catch (err) {
    return handleError(err);
  }
}

const actionSchema = z.object({
  action: z.enum(["resend", "reopen", "revoke"]),
  notes: z.string().max(2000).optional().default(""),
  contactEmail: z.string().trim().toLowerCase().email().max(200).optional(),
}).strict();

// resend: new link (old one dies) · reopen: send a submitted response back for changes · revoke: kill the link.
export async function POST(req: Request, { params }: { params: Promise<{ qid: string; rid: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { qid, rid } = await params;
    const { action, notes, contactEmail } = await parseBody(req, actionSchema);

    const existing = await prisma.questionnaireResponse.findUnique({
      where: { id: rid },
      include: {
        questionnaire: { select: { title: true, organizationId: true, organization: { select: { name: true } } } },
        vendor: { select: { name: true } },
      },
    });
    if (!existing || existing.questionnaireId !== qid || existing.questionnaire.organizationId !== user.organizationId) {
      throw new HttpError(404, "Response not found");
    }

    if (action === "revoke") {
      await prisma.questionnaireResponse.update({
        where: { id: rid },
        data: { inviteTokenHash: null, inviteExpiresAt: null, otpHash: null, otpExpiresAt: null },
      });
    } else {
      if (action === "reopen" && !["SUBMITTED", "REVIEWED"].includes(existing.status)) {
        throw new HttpError(400, "Only submitted responses can be sent back");
      }
      if (action === "resend" && !["NOT_STARTED", "IN_PROGRESS"].includes(existing.status)) {
        throw new HttpError(400, "This response is already submitted; send it back for changes instead");
      }
      const email = contactEmail || existing.contactEmail;
      if (!email) throw new HttpError(400, "A contact email is required");

      const token = generateTrustToken();
      const expiresAt = inviteExpiry();
      await prisma.questionnaireResponse.update({
        where: { id: rid },
        data: {
          contactEmail: email,
          inviteTokenHash: hashTrustToken(token),
          inviteExpiresAt: expiresAt,
          otpHash: null,
          otpExpiresAt: null,
          ...(action === "reopen" ? { status: "IN_PROGRESS", reviewNotes: notes, submittedAt: null } : {}),
        },
      });

      const inviteLink = `${portalBaseUrl(req)}/vendor-portal/${token}`;
      let emailSent = true;
      try {
        await sendVendorInviteEmail(email, {
          orgName: existing.questionnaire.organization.name,
          vendorName: existing.vendor.name,
          title: existing.questionnaire.title,
          link: inviteLink,
          expiresAt,
        });
      } catch (err) {
        emailSent = false;
        console.error("[vendor invite] email failed:", err);
      }
      await auditAction(user, existing, action, { contactEmail: email });
      return NextResponse.json({ inviteLink, emailSent });
    }

    await auditAction(user, existing, action, {});
    return NextResponse.json({ revoked: true });
  } catch (err) {
    return handleError(err);
  }
}

async function auditAction(
  user: { organizationId: string; id: string; name: string },
  r: { id: string; questionnaire: { title: string }; vendor: { name: string } },
  action: string,
  meta: Record<string, unknown>
) {
  await logAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userName: user.name,
    entityType: "QuestionnaireResponse",
    entityId: r.id,
    entityName: `${r.questionnaire.title} → ${r.vendor.name}`,
    action: "UPDATE",
    metadataJson: { event: `vendor_link_${action}`, ...meta },
  });
}
