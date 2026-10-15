import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logoResponse } from "@/lib/org-logo";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const config = await prisma.trustVaultConfig.findFirst({
      where: { enabled: true, organization: { slug } },
      select: { logoStorageKey: true, logoMimeType: true, organization: { select: { logoStorageKey: true, logoMimeType: true } } },
    });
    if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The Trust Vault's own logo wins; otherwise the organisation's logo.
    const own = config.logoStorageKey ? config : config.organization;
    const res = await logoResponse(own.logoStorageKey, own.logoMimeType, "public, max-age=300");
    return res ?? NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[trust/logo] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
