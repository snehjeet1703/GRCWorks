import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashTrustToken } from "@/lib/trust-token";
import { readUpload } from "@/lib/storage";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; docId: string }> }
) {
  try {
    const limited = limitOrNull(`trust-download:${clientIp(req.headers)}`, 120, 3600000);
    if (limited) return limited;

    const { slug, docId } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Trust vault not enabled" }, { status: 404 });
    }

    const doc = await prisma.trustVaultDocument.findFirst({
      where: { id: docId, configId: config.id, enabled: true },
    });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (doc.validUntil && doc.validUntil < new Date()) {
      return NextResponse.json({ error: "Document has expired" }, { status: 410 });
    }

    if (doc.permission !== "DOWNLOADABLE") {
      return NextResponse.json({ error: "Document is view-only" }, { status: 403 });
    }

    let downloaderEmail = "anonymous";

    if (doc.visibility === "ACCESS_REQUIRED") {
      if (!token) {
        return NextResponse.json({ error: "Access token required" }, { status: 401 });
      }

      const accessRequest = await prisma.trustAccessRequest.findFirst({
        where: {
          configId: config.id,
          accessTokenHash: hashTrustToken(token),
          status: "APPROVED",
          documentAccess: { some: { documentId: docId } },
        },
      });

      if (!accessRequest) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      if (accessRequest.tokenExpiresAt && accessRequest.tokenExpiresAt < new Date()) {
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      }

      downloaderEmail = accessRequest.email;

      if (config.requireNda) {
        const activeNda = await prisma.trustNda.findFirst({
          where: { configId: config.id, active: true },
        });
        if (activeNda) {
          const acceptance = await prisma.trustNdaAcceptance.findUnique({
            where: { ndaId_accessRequestId: { ndaId: activeNda.id, accessRequestId: accessRequest.id } },
          });
          if (!acceptance || acceptance.ndaVersion !== activeNda.version) {
            return NextResponse.json({ error: "NDA acceptance required" }, { status: 403 });
          }
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        userName: downloaderEmail,
        entityType: "TrustVaultDocument",
        entityId: docId,
        entityName: doc.name,
        action: "DOWNLOAD",
        changes: {},
        metadataJson: { downloaderEmail, ip: req.headers.get("x-forwarded-for") || "unknown" },
      },
    });

    const data = await readUpload(doc.storageKey);
    const encoded = encodeURIComponent(doc.fileName).replace(/'/g, "%27");

    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": doc.mimeType || "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
        "content-length": String(data.byteLength),
      },
    });
  } catch (err) {
    console.error("[trust/download] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
