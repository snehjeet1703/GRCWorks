import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { TRUST_CONTROL_SUGGESTIONS } from "@/lib/trust-controls";
import { getTrustConfigId } from "@/lib/trust-vault";

// Suggestions are inserted disabled: each one is a public claim, so an admin must opt in.
export async function POST() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const configId = await getTrustConfigId(user.organizationId);

    if ((await prisma.trustControl.count({ where: { configId } })) > 0) {
      throw new HttpError(409, "Controls already exist; suggestions are only for an empty list");
    }

    const rows = TRUST_CONTROL_SUGGESTIONS.flatMap(({ category, items }, ci) =>
      items.map((name, i) => ({ configId, category, name, enabled: false, sortOrder: ci * 100 + i }))
    );
    await prisma.trustControl.createMany({ data: rows });

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustControl", entityId: configId, entityName: "Suggested controls", action: "CREATE",
      metadataJson: { count: rows.length },
    });

    return NextResponse.json({ created: rows.length }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
