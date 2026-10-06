import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const config = await prisma.trustVaultConfig.findUnique({
      where: { organizationId: org.id },
    });
    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Trust vault not enabled" }, { status: 404 });
    }

    const badges = config.showCompliance
      ? await prisma.trustComplianceBadge.findMany({
          where: { configId: config.id, enabled: true },
          select: { id: true, name: true, description: true, iconUrl: true, sortOrder: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    const now = new Date();
    const documents = config.showDocuments
      ? await prisma.trustVaultDocument.findMany({
          where: {
            configId: config.id, enabled: true, visibility: "PUBLIC",
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
          select: {
            id: true, name: true, description: true, category: true,
            permission: true, fileSize: true, visibility: true, validUntil: true,
          },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    const controls = config.showControls
      ? await prisma.control.findMany({
          where: { organizationId: org.id, status: "IMPLEMENTED" },
          select: { id: true, code: true, title: true },
          orderBy: [{ code: "asc" }],
        })
      : [];

    const subprocessors = config.showSubprocessors
      ? await prisma.trustSubprocessor.findMany({
          where: { configId: config.id, enabled: true },
          select: { id: true, name: true, purpose: true, location: true, website: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];

    return NextResponse.json({
      organization: { name: org.name, slug: org.slug },
      config: {
        heroTitle: config.heroTitle,
        heroDescription: config.heroDescription,
        primaryColor: config.primaryColor,
        showCompliance: config.showCompliance,
        showDocuments: config.showDocuments,
        showControls: config.showControls,
        showSubprocessors: config.showSubprocessors,
        requireNda: config.requireNda,
      },
      badges,
      documents,
      controls,
      subprocessors,
      hasRestrictedDocs: config.showDocuments
        ? (await prisma.trustVaultDocument.count({
            where: {
              configId: config.id, enabled: true, visibility: "ACCESS_REQUIRED",
              OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            },
          })) > 0
        : false,
    });
  } catch (err) {
    console.error("[trust] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
