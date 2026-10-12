import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { VIEWABLE_MIME_TYPES } from "@/lib/trust-access";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"]),
  // Legacy shape: grants each document with its own default permission.
  documentIds: z.array(z.string().uuid()).optional().default([]),
  // Per-customer permission for each granted document.
  grants: z
    .array(z.object({ documentId: z.string().uuid(), permission: z.enum(["VIEW_ONLY", "DOWNLOADABLE"]) }).strict())
    .optional(),
}).strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;

    const existing = await prisma.trustAccessRequest.findFirst({
      where: { id, config: { organizationId: user.organizationId } },
    });
    if (!existing) throw new HttpError(404, "Access request not found");

    const { status, documentIds, grants } = await parseBody(req, reviewSchema);

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
        data.tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

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
      afterJson: { status, email: existing.email, grants: status === "APPROVED" ? grantRows : [] },
    });

    const { accessTokenHash, ...safe } = updated;
    return NextResponse.json({ ...safe, linkIssued: !!accessTokenHash, accessToken: plainToken });
  } catch (err) {
    return handleError(err);
  }
}
