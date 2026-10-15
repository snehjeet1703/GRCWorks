import { HttpError, handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { buildTemplate } from "@/lib/control-sheet";

// Control sheet template for a framework, pre-filled with the controls already mapped to it.
export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const frameworkId = new URL(req.url).searchParams.get("frameworkId");
    if (!frameworkId) throw new HttpError(400, "Choose a framework first");
    const { buffer, fileName } = await buildTemplate(user.organizationId, frameworkId);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
