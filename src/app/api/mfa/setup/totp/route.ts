import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateTotpSecret, encryptSecret } from "@/lib/mfa";
import QRCode from "qrcode";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { secret, uri } = generateTotpSecret(session.user.email);
    const qrCode = await QRCode.toDataURL(uri);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { totpSecret: encryptSecret(secret) },
    });

    return NextResponse.json({ secret, qrCode, uri });
  } catch (err) {
    console.error("[mfa/setup/totp] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
