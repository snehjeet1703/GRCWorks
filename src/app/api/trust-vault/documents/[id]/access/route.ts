import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const accessSchema = z.object({
  accessRequestIds: z.array(z.string().uuid()),
}).strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;

    const doc = await prisma.trustVaultDocument.findFirst({
      where: { id, config: { organizationId: user.organizationId } },
    });
    if (!doc) throw new HttpError(404, "Document not found");

    const { accessRequestIds } = await parseBody(req, accessSchema);

    await prisma.$transaction(async (tx) => {
      await tx.trustDocumentAccess.deleteMany({ where: { documentId: id } });
      if (accessRequestIds.length > 0) {
        await tx.trustDocumentAccess.createMany({
          data: accessRequestIds.map((accessRequestId) => ({
            accessRequestId,
            documentId: id,
          })),
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
