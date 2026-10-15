import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, readUploadForm, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { limitOrNull } from "@/lib/rate-limit";
import { parseQuestionnaireSheet } from "@/lib/questionnaire-sheet";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Reads a filled-in question sheet.
 * mode=preview returns the parsed questions and any problems; mode=create saves them as a new draft questionnaire.
 */
export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_WRITE);
    const limited = limitOrNull(`questionnaire-import:${user.id}`, 30, 10 * 60 * 1000);
    if (limited) return limited;
    const form = await readUploadForm(req, MAX_BYTES, "The sheet must be 5 MB or smaller.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose the filled-in question sheet to upload");
    if (file.size > MAX_BYTES) throw new HttpError(413, "The sheet must be 5 MB or smaller.");

    const sheet = await parseQuestionnaireSheet(file);
    if (sheet.questions.length === 0 && sheet.errors.length === 0) throw new HttpError(400, "The sheet has no questions in it.");
    if (form.get("mode") !== "create") return NextResponse.json(sheet);

    if (sheet.errors.length) throw new HttpError(400, "Fix the rows with problems and upload the sheet again.");
    const title = String(form.get("title") ?? "").trim();
    if (!title) throw new HttpError(400, "Give the questionnaire a title");
    if (title.length > 300) throw new HttpError(400, "The title must be 300 characters or fewer");
    const description = String(form.get("description") ?? "").slice(0, 2000);
    const category = String(form.get("category") ?? "GENERAL").trim().slice(0, 100) || "GENERAL";

    const created = await prisma.$transaction(async (tx) => {
      const q = await tx.vendorQuestionnaire.create({
        data: { organizationId: user.organizationId, title, description, category, status: "DRAFT", questions: sheet.questions },
      });
      await logAudit({
        organizationId: user.organizationId, userId: user.id, userName: user.name,
        entityType: "vendorquestionnaire", entityId: q.id, entityName: q.title, action: "CREATE",
        afterJson: { title: q.title, category: q.category, questionCount: sheet.questions.length, importedFrom: file.name },
      }, tx);
      return q;
    });
    return NextResponse.json({ ...created, _count: { responses: 0 } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
