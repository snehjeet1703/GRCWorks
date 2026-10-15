import { handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { buildQuestionnaireTemplate } from "@/lib/questionnaire-sheet";

// Question sheet template: examples, or an existing questionnaire's questions when ?questionnaireId= is given.
export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const questionnaireId = new URL(req.url).searchParams.get("questionnaireId");
    const { buffer, fileName } = await buildQuestionnaireTemplate(user.organizationId, questionnaireId);
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
