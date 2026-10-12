import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashTrustToken } from "@/lib/trust-token";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

const acceptSchema = z.object({
  token: z.string().min(16).max(128),
  ndaId: z.string().uuid(),
}).strict();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!config.requireNda) {
      return NextResponse.json({ required: false });
    }

    const nda = await prisma.trustNda.findFirst({
      where: { configId: config.id, active: true },
      select: { id: true, title: true, content: true, version: true },
    });

    if (!nda) {
      return NextResponse.json({ required: false });
    }

    return NextResponse.json({ required: true, nda });
  } catch (err) {
    console.error("[trust/nda] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = limitOrNull(`trust-nda:${clientIp(req.headers)}`, 20, 3600000);
    if (limited) return limited;

    const { slug } = await params;
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled || !config.requireNda) {
      return NextResponse.json({ error: "NDA not required" }, { status: 400 });
    }

    let data: z.infer<typeof acceptSchema>;
    try {
      data = acceptSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const accessRequest = await prisma.trustAccessRequest.findFirst({
      where: { configId: config.id, accessTokenHash: hashTrustToken(data.token), status: "APPROVED" },
    });
    if (!accessRequest) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (accessRequest.tokenExpiresAt && accessRequest.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }

    const nda = await prisma.trustNda.findFirst({
      where: { id: data.ndaId, configId: config.id, active: true },
    });
    if (!nda) {
      return NextResponse.json({ error: "NDA not found" }, { status: 404 });
    }

    const existing = await prisma.trustNdaAcceptance.findUnique({
      where: { ndaId_accessRequestId: { ndaId: nda.id, accessRequestId: accessRequest.id } },
    });

    if (existing && existing.ndaVersion === nda.version) {
      return NextResponse.json({ accepted: true, message: "Already accepted" });
    }

    await prisma.trustNdaAcceptance.upsert({
      where: { ndaId_accessRequestId: { ndaId: nda.id, accessRequestId: accessRequest.id } },
      create: {
        ndaId: nda.id,
        accessRequestId: accessRequest.id,
        ndaVersion: nda.version,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      },
      update: {
        ndaVersion: nda.version,
        acceptedAt: new Date(),
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        userName: accessRequest.email,
        entityType: "TrustNda",
        entityId: nda.id,
        entityName: nda.title,
        action: "NDA_ACCEPTED",
        changes: {},
        metadataJson: {
          email: accessRequest.email,
          ndaVersion: nda.version,
          ip: req.headers.get("x-forwarded-for") || "unknown",
        },
      },
    });

    return NextResponse.json({ accepted: true });
  } catch (err) {
    console.error("[trust/nda] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
