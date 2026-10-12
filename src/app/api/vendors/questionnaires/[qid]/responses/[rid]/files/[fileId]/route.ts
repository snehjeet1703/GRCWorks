import { prisma } from "@/lib/db";
import { handleError, HttpError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { readUpload } from "@/lib/storage";

// Vendor uploads are untrusted: always download as an attachment, never render inline.
export async function GET(_req: Request, { params }: { params: Promise<{ qid: string; rid: string; fileId: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.VENDORS_READ);
    const { qid, rid, fileId } = await params;
    const file = await prisma.vendorResponseFile.findFirst({
      where: {
        id: fileId,
        responseId: rid,
        response: { questionnaireId: qid, questionnaire: { organizationId: user.organizationId } },
      },
    });
    if (!file) throw new HttpError(404, "File not found");

    const data = await readUpload(file.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "content-length": String(data.byteLength),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
