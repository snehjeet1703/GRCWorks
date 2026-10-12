import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { readUpload } from "@/lib/storage";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { resolveTrustDocAccess } from "@/lib/trust-access";
import { watermarkedPdf } from "@/lib/watermark";

// In-browser viewing for view-only grants: a per-viewer watermarked PDF, shown inline, never cached.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; docId: string }> }
) {
  try {
    const limited = limitOrNull(`trust-view:${clientIp(req.headers)}`, 120, 3600000);
    if (limited) return limited;

    const { slug, docId } = await params;
    const token = new URL(req.url).searchParams.get("token");
    const access = await resolveTrustDocAccess(slug, docId, token);
    if (!access.canView) throw new HttpError(415, "This document can't be previewed; it can only be downloaded");

    let pdf: Uint8Array;
    try {
      pdf = await watermarkedPdf(new Uint8Array(await readUpload(access.doc.storageKey)), access.doc.mimeType, {
        viewer: access.viewerEmail ?? "Public viewer",
        organization: access.organizationName,
        date: new Date(),
      });
    } catch (err) {
      console.error("[trust/view] watermarking failed:", err);
      throw new HttpError(422, "This document can't be displayed. Ask the owner for a standard (unencrypted) PDF.");
    }

    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    const who = access.viewerEmail ?? "anonymous";
    await prisma.auditLog.create({
      data: {
        organizationId: org!.id,
        userName: who,
        entityType: "TrustVaultDocument",
        entityId: docId,
        entityName: access.doc.name,
        action: "VIEW",
        changes: {},
        metadataJson: { viewerEmail: who, ip: clientIp(req.headers) },
      },
    });

    const inlineName = encodeURIComponent(access.doc.name.replace(/\.[a-z0-9]+$/i, "") + ".pdf");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename*=UTF-8''${inlineName}`,
        "content-length": String(pdf.byteLength),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store, max-age=0",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
