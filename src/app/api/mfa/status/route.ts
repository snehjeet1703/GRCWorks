import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        mfaEnabled: true,
        mfaMethod: true,
        totpVerifiedAt: true,
        webauthnCredentials: { select: { id: true, deviceName: true, createdAt: true } },
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { mfaRequired: true },
    });

    return NextResponse.json({
      mfaEnabled: user.mfaEnabled,
      mfaMethod: user.mfaMethod,
      totpConfigured: !!user.totpVerifiedAt,
      webauthnCredentials: user.webauthnCredentials,
      orgMfaRequired: org?.mfaRequired ?? false,
    });
  } catch (err) {
    console.error("[mfa/status] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
