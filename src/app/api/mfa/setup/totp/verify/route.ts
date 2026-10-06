import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTotpCode, decryptSecret, generateRecoveryCodes, hashRecoveryCodes } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";

const schema = z.object({ code: z.string().length(6) });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { code } = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { totpSecret: true, organizationId: true, name: true },
    });
    if (!user?.totpSecret) {
      return NextResponse.json({ error: "TOTP not configured. Generate a secret first." }, { status: 400 });
    }

    const secret = decryptSecret(user.totpSecret);
    if (!verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const plainCodes = generateRecoveryCodes();
    const hashedCodes = await hashRecoveryCodes(plainCodes);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        mfaEnabled: true,
        mfaMethod: "TOTP",
        totpVerifiedAt: new Date(),
        recoveryCodes: hashedCodes,
      },
    });

    await logAudit({
      organizationId: user.organizationId,
      userId: session.user.id,
      userName: user.name,
      entityType: "MFA",
      entityId: session.user.id,
      action: "CREATE",
      afterJson: { method: "TOTP" },
    });

    return NextResponse.json({ success: true, recoveryCodes: plainCodes });
  } catch (err) {
    console.error("[mfa/setup/totp/verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
