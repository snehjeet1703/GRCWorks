import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { readUpload } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_READ);
    const { id } = await params;
    const evidence = await prisma.evidence.findFirst({
      where: { id, control: { organizationId: user.organizationId } },
    });
    if (!evidence) throw new HttpError(404, "Evidence not found");
    if (!evidence.fileUrl.startsWith("local:")) {
      throw new HttpError(400, "File is not stored locally");
    }
    const data = await readUpload(evidence.fileUrl.slice("local:".length));
    const encoded = encodeURIComponent(evidence.fileName).replace(/'/g, "%27");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
        "content-length": String(data.byteLength),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
