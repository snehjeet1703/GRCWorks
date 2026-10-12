import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTrustToken, hashTrustToken } from "@/lib/trust-token";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "DENIED"]),
  documentIds: z.array(z.string().uuid()).optional().default([]),
}).strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;

    const existing = await prisma.trustAccessRequest.findFirst({
      where: { id, config: { organizationId: user.organizationId } },
    });
    if (!existing) throw new HttpError(404, "Access request not found");

    const { status, documentIds } = await parseBody(req, reviewSchema);

    const grantIds = [...new Set(documentIds ?? [])];
    if (grantIds.length > 0) {
      const owned = await prisma.trustVaultDocument.count({
        where: { id: { in: grantIds }, configId: existing.configId },
      });
      if (owned !== grantIds.length) throw new HttpError(400, "Unknown document in grant");
    }

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
        if (documentIds.length > 0) {
          await tx.trustDocumentAccess.createMany({
            data: documentIds.map((documentId) => ({
              accessRequestId: id,
              documentId,
            })),
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
      afterJson: { status, email: existing.email, documentIds },
    });

    const { accessTokenHash, ...safe } = updated;
    return NextResponse.json({ ...safe, linkIssued: !!accessTokenHash, accessToken: plainToken });
  } catch (err) {
    return handleError(err);
  }
}
