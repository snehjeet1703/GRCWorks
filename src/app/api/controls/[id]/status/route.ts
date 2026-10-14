import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requireSession, userHasPermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { computeEvidenceStatus } from "@/lib/evidence-status";

const schema = z.object({ status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED"]) }).strict();

// Lets a control's owner (or anyone who can edit controls) move it through its lifecycle.
// Closing a control (IMPLEMENTED) requires at least one evidence file that is still valid.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const { status } = await parseBody(req, schema);

    const control = await prisma.control.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true, code: true, title: true, status: true, ownerId: true, reviewState: true,
        organization: { select: { controlApprovalRequired: true } },
        evidenceLinks: { select: { evidence: { select: { status: true, validFrom: true, validUntil: true } } } },
      },
    });
    if (!control) throw new HttpError(404, "Control not found");

    if (control.ownerId !== user.id && !(await userHasPermission(user.id, PERMISSIONS.CONTROLS_WRITE))) {
      throw new HttpError(403, `Only the control's owner or someone with the "Edit controls" permission can change its status.`);
    }

    if (status === "IMPLEMENTED" && control.organization.controlApprovalRequired) {
      throw new HttpError(400, "Closing a control needs a reviewer's approval. Submit it for review instead.");
    }
    if (status === "IMPLEMENTED") {
      const now = new Date();
      const valid = control.evidenceLinks.filter((l) => ["VALID", "EXPIRING"].includes(computeEvidenceStatus(l.evidence, now)));
      if (valid.length === 0) {
        throw new HttpError(400, "Upload at least one valid evidence file before marking this control implemented.");
      }
    }

    if (status === control.status && control.reviewState === "NONE") return NextResponse.json({ id, status });

    await prisma.$transaction(async (tx) => {
      // Moving the status by hand withdraws any pending review or earlier feedback.
      await tx.control.update({ where: { id }, data: { status, reviewState: "NONE", reviewSubmittedAt: null, reviewSubmittedById: null } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Control",
          entityId: id,
          entityName: `${control.code} ${control.title}`,
          action: "UPDATE",
          changes: { status: { from: control.status, to: status } },
        },
        tx
      );
    });
    return NextResponse.json({ id, status });
  } catch (err) {
    return handleError(err);
  }
}
