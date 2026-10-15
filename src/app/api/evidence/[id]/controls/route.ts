import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission, userHasPermission } from "@/lib/api";
import { applyEvidenceRemoval, evidenceRemovalImpact, impactSummary } from "@/lib/evidence-impact";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  controlIds: z.array(z.string().uuid()).min(1, "Evidence must support at least one control").max(200),
}).strict();

// Replaces the set of controls an evidence artifact supports.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_UPLOAD);
    const { id } = await params;
    const { controlIds } = await parseBody(req, schema);
    const wanted = [...new Set(controlIds)];

    const evidence = await prisma.evidence.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { controls: { select: { control: { select: { id: true, code: true } } } } },
    });
    if (!evidence) throw new HttpError(404, "Evidence not found");

    const controls = await prisma.control.findMany({
      where: { id: { in: wanted }, organizationId: user.organizationId },
      select: { id: true, code: true },
    });
    if (controls.length !== wanted.length) throw new HttpError(404, "Control not found");

    const before = evidence.controls.map((l) => l.control);
    const added = controls.filter((c) => !before.some((b) => b.id === c.id));
    const removed = before.filter((b) => !wanted.includes(b.id));
    const impact = await evidenceRemovalImpact(user.organizationId, id, removed.map((c) => c.id));
    // Approved evidence of a finished audit period is the audit record: only admins may remove it.
    if (impact.protected && !(await userHasPermission(user.id, PERMISSIONS.ROLES_MANAGE))) {
      throw new HttpError(403, `This file is the approved evidence for a finished audit (${impact.slots.filter((s) => s.periodClosed).map((s) => `${s.periodName} · ${s.code} · ${s.label}`).slice(0, 3).join("; ")}). Only an admin can remove it.`);
    }

    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.evidenceControl.deleteMany({
          where: { evidenceId: id, controlId: { in: removed.map((c) => c.id) } },
        });
        await applyEvidenceRemoval(tx, impact);
      }
      if (added.length > 0) {
        await tx.evidenceControl.createMany({
          data: added.map((c) => ({ evidenceId: id, controlId: c.id })),
        });
      }
      if (added.length > 0 || removed.length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Evidence",
            entityId: id,
            entityName: evidence.fileName,
            action: "UPDATE",
            changes: {
              controls: { from: before.map((c) => c.code), to: controls.map((c) => c.code) },
              ...impactSummary(impact),
            },
          },
          tx
        );
      }
    });

    return NextResponse.json({ controlIds: wanted });
  } catch (err) {
    return handleError(err);
  }
}
