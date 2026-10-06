import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Trust vault not enabled" }, { status: 404 });
    }

    const accessRequest = await prisma.trustAccessRequest.findFirst({
      where: {
        configId: config.id,
        accessToken: token,
        status: "APPROVED",
      },
      include: {
        documentAccess: {
          include: {
            document: {
              select: {
                id: true, name: true, description: true, category: true,
                permission: true, fileSize: true, visibility: true, enabled: true, validUntil: true,
              },
            },
          },
        },
      },
    });

    if (!accessRequest) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (accessRequest.tokenExpiresAt && accessRequest.tokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "Token expired" }, { status: 401 });
    }

    const now = new Date();
    const documents = accessRequest.documentAccess
      .filter((da) => da.document.enabled && (!da.document.validUntil || da.document.validUntil > now))
      .map((da) => da.document);

    let ndaAccepted = true;
    let ndaRequired = false;
    if (config.requireNda) {
      const activeNda = await prisma.trustNda.findFirst({
        where: { configId: config.id, active: true },
      });
      if (activeNda) {
        ndaRequired = true;
        const acceptance = await prisma.trustNdaAcceptance.findUnique({
          where: { ndaId_accessRequestId: { ndaId: activeNda.id, accessRequestId: accessRequest.id } },
        });
        ndaAccepted = !!acceptance && acceptance.ndaVersion === activeNda.version;
      }
    }

    return NextResponse.json({
      email: accessRequest.email,
      name: accessRequest.name,
      company: accessRequest.company,
      documents,
      ndaRequired,
      ndaAccepted,
    });
  } catch (err) {
    console.error("[trust/verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
