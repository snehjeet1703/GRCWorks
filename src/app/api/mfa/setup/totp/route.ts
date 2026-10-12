import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTotpSecret, encryptSecret } from "@/lib/mfa";
import { forbidIfPendingWithExistingMfa, getMfaSessionUser } from "@/lib/mfa-session";
import QRCode from "qrcode";

export async function POST() {
  try {
    const user = await getMfaSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } });
    const blocked = forbidIfPendingWithExistingMfa(user, !!dbUser?.mfaEnabled);
    if (blocked) return blocked;

    const { secret, uri } = generateTotpSecret(user.email);
    const qrCode = await QRCode.toDataURL(uri);

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(secret) },
    });

    return NextResponse.json({ secret, qrCode, uri });
  } catch (err) {
    console.error("[mfa/setup/totp] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
