import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const linkSchema = z.object({
  controlIds: z.array(z.string().uuid()).max(50),
}).strict();

async function findDoc(id: string, organizationId: string) {
  const doc = await prisma.trustVaultDocument.findFirst({
    where: { id, config: { organizationId } },
  });
  if (!doc) throw new HttpError(404, "Document not found");
  return doc;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const { id } = await params;
    await findDoc(id, user.organizationId);

    const links = await prisma.trustDocumentControl.findMany({
      where: { documentId: id },
      include: { control: { select: { id: true, code: true, title: true } } },
    });
    return NextResponse.json(links.map((l) => l.control));
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const { id } = await params;
    const doc = await findDoc(id, user.organizationId);
    const { controlIds } = await parseBody(req, linkSchema);

    const controls = await prisma.control.findMany({
      where: { id: { in: controlIds }, organizationId: user.organizationId },
      select: { id: true },
    });
    const validIds = controls.map((c) => c.id);

    await prisma.$transaction(async (tx) => {
      await tx.trustDocumentControl.deleteMany({ where: { documentId: id } });
      if (validIds.length > 0) {
        await tx.trustDocumentControl.createMany({
          data: validIds.map((controlId) => ({ documentId: id, controlId })),
        });
      }
    });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustVaultDocument", entityId: id, action: "LINK_CONTROLS",
      afterJson: { documentName: doc.name, controlIds: validIds },
    });

    return NextResponse.json({ success: true, linked: validIds.length });
  } catch (err) {
    return handleError(err);
  }
}
