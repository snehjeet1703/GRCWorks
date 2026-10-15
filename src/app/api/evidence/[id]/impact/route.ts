import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission, userHasPermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { evidenceRemovalImpact } from "@/lib/evidence-impact";

/**
 * What deleting this evidence (or unlinking it from some controls, via ?remove=id,id) would reopen.
 * Shown in the confirmation before anything is removed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_READ);
    const { id } = await params;
    const evidence = await prisma.evidence.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { controls: { select: { controlId: true } } },
    });
    if (!evidence) throw new HttpError(404, "Evidence not found");

    const linked = evidence.controls.map((c) => c.controlId);
    const remove = new URL(req.url).searchParams.get("remove");
    const controlIds = remove === null ? linked : remove.split(",").filter((c) => linked.includes(c));

    const impact = await evidenceRemovalImpact(user.organizationId, id, controlIds);
    const canOverride = await userHasPermission(user.id, PERMISSIONS.ROLES_MANAGE);
    return NextResponse.json({ ...impact, canOverride });
  } catch (err) {
    return handleError(err);
  }
}
