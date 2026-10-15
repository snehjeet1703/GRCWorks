import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { VIEWABLE_MIME_TYPES } from "@/lib/trust-access";
import { sendTrustAccessExtendedEmail, sendTrustAccessGrantedEmail } from "@/lib/email";
import { portalBaseUrl } from "@/lib/vendor-portal";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"]),
  // Legacy shape: grants each document with its own default permission.
  documentIds: z.array(z.string().uuid()).optional().default([]),
  // Per-customer permission for each granted document.
  grants: z
    .array(z.object({ documentId: z.string().uuid(), permission: z.enum(["VIEW_ONLY", "DOWNLOADABLE"]) }).strict())
    .optional(),
  // Days the access link stays valid; null means it never expires.
  expiresInDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.null()]).optional().default(30),
}).strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;

    const existing = await prisma.trustAccessRequest.findFirst({
      where: { id, config: { organizationId: user.organizationId } },
    });
    if (!existing) throw new HttpError(404, "Access request not found");

    const { status, documentIds, grants, expiresInDays } = await parseBody(req, reviewSchema);

    const requested = new Map<string, "VIEW_ONLY" | "DOWNLOADABLE" | null>();
    for (const id of documentIds ?? []) requested.set(id, null);
    for (const g of grants ?? []) requested.set(g.documentId, g.permission);

    const docs = requested.size
      ? await prisma.trustVaultDocument.findMany({
          where: { id: { in: [...requested.keys()] }, configId: existing.configId },
          select: { id: true, name: true, mimeType: true, permission: true },
        })
      : [];
    if (docs.length !== requested.size) throw new HttpError(400, "Unknown document in grant");

    const grantRows = docs.map((d) => {
      const permission = requested.get(d.id) ?? d.permission;
      if (permission === "VIEW_ONLY" && !VIEWABLE_MIME_TYPES.has(d.mimeType)) {
        throw new HttpError(400, `"${d.name}" can't be previewed in the browser; grant it as Download or upload it as a PDF`);
      }
      return { documentId: d.id, permission };
    });

    // Only the hash is stored; the plain token is returned once so the admin can send the link.
    const plainToken = status === "APPROVED" ? generateTrustToken() : null;

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {
        status,
        reviewedAt: new Date(),
        reviewedBy: user.id,
      };

      if (status === "APPROVED") {
        data.accessTokenHash = hashTrustToken(plainToken!);
        data.tokenExpiresAt = expiresInDays === null ? null : new Date(Date.now() + (expiresInDays ?? 30) *24 * 60 * 60 * 1000);

        await tx.trustDocumentAccess.deleteMany({ where: { accessRequestId: id } });
        if (grantRows.length > 0) {
          await tx.trustDocumentAccess.createMany({
            data: grantRows.map((g) => ({ accessRequestId: id, ...g })),
          });
        }
      } else if (status === "DENIED") {
        data.accessTokenHash = null;
        data.tokenExpiresAt = null;
        await tx.trustDocumentAccess.deleteMany({ where: { accessRequestId: id } });
      }

      return tx.trustAccessRequest.update({ where: { id }, data });
    });

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustAccessRequest", entityId: id,
      action: status === "APPROVED" ? "APPROVE" : "UPDATE",
      afterJson: { status, email: existing.email, grants: status === "APPROVED" ? grantRows : [], expiresInDays: status === "APPROVED" ? expiresInDays : undefined },
    });

    // Email the link straight to the customer. The admin still sees it once, as a fallback if mail fails.
    let emailed = false;
    if (plainToken) {
      try {
        const org = await prisma.organization.findUniqueOrThrow({
          where: { id: user.organizationId },
          select: { name: true, slug: true },
        });
        const trustPageUrl = `${portalBaseUrl(req)}/trust/${org.slug}`;
        await sendTrustAccessGrantedEmail(existing.email, {
          orgName: org.name,
          name: existing.name || existing.email,
          link: `${trustPageUrl}?token=${encodeURIComponent(plainToken)}`,
          trustPageUrl,
          expiresAt: updated.tokenExpiresAt,
          documents: docs
            .filter((d) => grantRows.some((g) => g.documentId === d.id))
            .map((d) => ({ name: d.name, permission: grantRows.find((g) => g.documentId === d.id)!.permission })),
        });
        emailed = true;
      } catch (err) {
        console.error("[trust-vault/access-requests] access email failed:", err);
      }
    }

    const { accessTokenHash, ...safe } = updated;
    return NextResponse.json({ ...safe, linkIssued: !!accessTokenHash, accessToken: plainToken, emailed });
  } catch (err) {
    return handleError(err);
  }
}

const extendSchema = z.object({
  // Days added to the access; null makes it open-ended.
  extendByDays: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60), z.null()]),
}).strict();

// Extends an approved customer's access without them asking and without changing their link.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;

    const existing = await prisma.trustAccessRequest.findFirst({
      where: { id, config: { organizationId: user.organizationId } },
    });
    if (!existing) throw new HttpError(404, "Access request not found");
    if (existing.status !== "APPROVED" || !existing.accessTokenHash) {
      throw new HttpError(400, "Only approved customers with an access link can be extended");
    }

    const { extendByDays } = await parseBody(req, extendSchema);
    // Adds to whatever is left; an expired grant restarts from today.
    const base = Math.max(Date.now(), existing.tokenExpiresAt?.getTime() ?? 0);
    const tokenExpiresAt = extendByDays === null ? null : new Date(base + extendByDays * 86_400_000);

    const updated = await prisma.trustAccessRequest.update({ where: { id }, data: { tokenExpiresAt } });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustAccessRequest", entityId: id, action: "UPDATE",
      beforeJson: { tokenExpiresAt: existing.tokenExpiresAt },
      afterJson: { email: existing.email, extendByDays, tokenExpiresAt },
    });

    let emailed = false;
    try {
      const org = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { name: true, slug: true } });
      await sendTrustAccessExtendedEmail(existing.email, {
        orgName: org.name,
        name: existing.name || existing.email,
        trustPageUrl: `${portalBaseUrl(req)}/trust/${org.slug}`,
        expiresAt: tokenExpiresAt,
      });
      emailed = true;
    } catch (err) {
      console.error("[trust-vault/access-requests] extension email failed:", err);
    }

    const { accessTokenHash, ...safe } = updated;
    return NextResponse.json({ ...safe, linkIssued: true, emailed });
  } catch (err) {
    return handleError(err);
  }
}
