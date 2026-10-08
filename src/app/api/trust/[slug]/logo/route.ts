import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { LOGO_MIME_TYPES } from "@/lib/trust-logo";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const config = await prisma.trustVaultConfig.findFirst({
      where: { enabled: true, organization: { slug } },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    if (!config?.logoStorageKey || !config.logoMimeType || !LOGO_MIME_TYPES.has(config.logoMimeType)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = await readUpload(config.logoStorageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": config.logoMimeType,
        "content-length": String(data.byteLength),
        "x-content-type-options": "nosniff",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[trust/logo] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
