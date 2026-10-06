import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
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

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {
        status,
        reviewedAt: new Date(),
        reviewedBy: user.id,
      };

      if (status === "APPROVED") {
        data.accessToken = randomUUID();
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
        data.accessToken = null;
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

    return NextResponse.json(updated);
  } catch (err) {
    return handleError(err);
  }
}
