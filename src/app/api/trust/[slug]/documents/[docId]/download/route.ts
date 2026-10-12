import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { resolveTrustDocAccess } from "@/lib/trust-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; docId: string }> }
) {
  try {
    const limited = limitOrNull(`trust-download:${clientIp(req.headers)}`, 120, 3600000);
    if (limited) return limited;

    const { slug, docId } = await params;
    const token = new URL(req.url).searchParams.get("token");
    const access = await resolveTrustDocAccess(slug, docId, token);
    if (!access.canDownload) throw new HttpError(403, "This document is view-only for you");

    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    const who = access.viewerEmail ?? "anonymous";
    await prisma.auditLog.create({
      data: {
        organizationId: org!.id,
        userName: who,
        entityType: "TrustVaultDocument",
        entityId: docId,
        entityName: access.doc.name,
        action: "DOWNLOAD",
        changes: {},
        metadataJson: { downloaderEmail: who, ip: clientIp(req.headers) },
      },
    });

    const data = await readUpload(access.doc.storageKey);
    const encoded = encodeURIComponent(access.doc.fileName).replace(/'/g, "%27");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": access.doc.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
        "content-length": String(data.byteLength),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
