import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { sendVendorInviteEmail } from "@/lib/email";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { inviteExpiry, portalBaseUrl } from "@/lib/vendor-portal";

const sendSchema = z.object({
  questionnaireId: z.string().uuid(),
  contactEmail: z.string().trim().toLowerCase().email().max(200).optional(),
}).strict();

// Never send link/OTP hashes to the browser.
function stripSecrets<T extends { inviteTokenHash?: string | null; otpHash?: string | null }>(r: T) {
  const { inviteTokenHash, otpHash, ...rest } = r;
  return { ...rest, linkActive: !!inviteTokenHash };
}

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.array(z.string()), z.number(), z.boolean()]),
});

const submitSchema = z.object({
  questionnaireId: z.string().uuid(),
  answers: z.array(answerSchema),
  status: z.enum(["IN_PROGRESS", "SUBMITTED"]).optional().default("SUBMITTED"),
}).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { id } = await params;
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor || vendor.organizationId !== user.organizationId) {
      throw new HttpError(404, "Vendor not found");
    }
    const responses = await prisma.questionnaireResponse.findMany({
      where: { vendorId: id },
      include: {
        questionnaire: { select: { id: true, title: true, category: true, questions: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(responses.map(stripSecrets));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "submit") {
      const data = await parseBody(req, submitSchema);
      const response = await prisma.$transaction(async (tx) => {
        const vendor = await tx.vendor.findUnique({ where: { id } });
        if (!vendor || vendor.organizationId !== user.organizationId) {
          throw new HttpError(404, "Vendor not found");
        }
        const existing = await tx.questionnaireResponse.findUnique({
          where: { questionnaireId_vendorId: { questionnaireId: data.questionnaireId, vendorId: id } },
        });
        if (!existing) throw new HttpError(404, "Questionnaire not sent to this vendor");

        const updated = await tx.questionnaireResponse.update({
          where: { id: existing.id },
          data: {
            answers: data.answers as any,
            status: data.status,
            submittedAt: data.status === "SUBMITTED" ? new Date() : null,
          },
        });
        await logAudit({
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "questionnaireresponse",
          entityId: updated.id,
          entityName: `${vendor.name} questionnaire response`,
          action: "UPDATE",
        }, tx);
        return updated;
      });
      return NextResponse.json(stripSecrets(response));
    }

    // Default: send a questionnaire to this vendor's contact via the external portal
    const data = await parseBody(req, sendSchema);
    const token = generateTrustToken();
    const expiresAt = inviteExpiry();
    const { response, vendorName, title, orgName, contactEmail } = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id } });
      if (!vendor || vendor.organizationId !== user.organizationId) {
        throw new HttpError(404, "Vendor not found");
      }
      const questionnaire = await tx.vendorQuestionnaire.findUnique({ where: { id: data.questionnaireId } });
      if (!questionnaire || questionnaire.organizationId !== user.organizationId) {
        throw new HttpError(404, "Questionnaire not found");
      }
      if (questionnaire.status !== "PUBLISHED") {
        throw new HttpError(400, "Questionnaire must be published before sending");
      }
      const existing = await tx.questionnaireResponse.findUnique({
        where: { questionnaireId_vendorId: { questionnaireId: data.questionnaireId, vendorId: id } },
      });
      if (existing) throw new HttpError(409, "Questionnaire already sent to this vendor");

      const contactEmail = data.contactEmail || vendor.contactEmail.trim().toLowerCase();
      if (!contactEmail) throw new HttpError(400, "Add a contact email for this vendor first");

      const created = await tx.questionnaireResponse.create({
        data: {
          questionnaireId: data.questionnaireId,
          vendorId: id,
          status: "NOT_STARTED",
          contactEmail,
          inviteTokenHash: hashTrustToken(token),
          inviteExpiresAt: expiresAt,
        },
      });
      const org = await tx.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
      await logAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userName: user.name,
        entityType: "questionnaireresponse",
        entityId: created.id,
        entityName: `${questionnaire.title} → ${vendor.name}`,
        action: "CREATE",
        metadataJson: { event: "vendor_invited", contactEmail },
      }, tx);
      return { response: created, vendorName: vendor.name, title: questionnaire.title, orgName: org?.name ?? "", contactEmail };
    });

    const inviteLink = `${portalBaseUrl(req)}/vendor-portal/${token}`;
    let emailSent = true;
    try {
      await sendVendorInviteEmail(contactEmail, { orgName, vendorName, title, link: inviteLink, expiresAt });
    } catch (err) {
      emailSent = false;
      console.error("[vendor invite] email failed:", err);
    }
    // The link is returned once so it can be shared manually when email isn't configured.
    return NextResponse.json({ ...stripSecrets(response), inviteLink, emailSent }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
