import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { limitOrNull } from "@/lib/rate-limit";
import { saveUpload } from "@/lib/storage";
import { parseQuestions, requireEditable, requirePortalSession } from "@/lib/vendor-portal";
import { VENDOR_UPLOAD_MAX_FILES, assertVendorUpload, safeDisplayName } from "@/lib/vendor-upload";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const r = await requirePortalSession(token);
    const limited = limitOrNull(`vp-upload:${r.id}`, 30, 10 * 60 * 1000);
    if (limited) return limited;
    requireEditable(r);

    if (r.files.length >= VENDOR_UPLOAD_MAX_FILES) {
      throw new HttpError(400, `A response can have at most ${VENDOR_UPLOAD_MAX_FILES} files`);
    }

    const form = await req.formData();
    const questionId = String(form.get("questionId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "File is required");
    if (!parseQuestions(r.questionnaire.questions).some((q) => q.id === questionId)) {
      throw new HttpError(400, "Unknown question");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const fileName = safeDisplayName(file.name);
    assertVendorUpload(fileName, file.type, data);

    const { storageKey, size } = await saveUpload(fileName, data);
    const created = await prisma.vendorResponseFile.create({
      data: { responseId: r.id, questionId, fileName, storageKey, fileSize: size, mimeType: file.type || "application/octet-stream" },
      select: { id: true, questionId: true, fileName: true, fileSize: true, createdAt: true },
    });
    if (r.status === "NOT_STARTED") {
      await prisma.questionnaireResponse.update({ where: { id: r.id }, data: { status: "IN_PROGRESS" } });
    }
    await logAudit({
      organizationId: r.questionnaire.organizationId,
      userId: null,
      userName: r.contactEmail,
      entityType: "QuestionnaireResponse",
      entityId: r.id,
      entityName: `${r.questionnaire.title} → ${r.vendor.name}`,
      action: "CREATE",
      metadataJson: { event: "vendor_file_uploaded", fileName, size },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
