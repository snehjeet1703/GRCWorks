import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { generateRecoveryCodes, hashRecoveryCodes } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3002";

const schema = z.object({
  credential: z.any(),
  deviceName: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { credential, deviceName } = schema.parse(body);

    const challenge = await prisma.mfaChallenge.findFirst({
      where: {
        userId: session.user.id,
        type: "WEBAUTHN",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge?.challenge) {
      return NextResponse.json({ error: "No pending challenge" }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential: regCred } = verification.registrationInfo;

    await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { used: true } });

    const isFirstCredential = (await prisma.webAuthnCredential.count({
      where: { userId: session.user.id },
    })) === 0;

    await prisma.webAuthnCredential.create({
      data: {
        userId: session.user.id,
        credentialId: Buffer.from(regCred.id).toString("base64url"),
        publicKey: Buffer.from(regCred.publicKey),
        counter: BigInt(regCred.counter),
        deviceName: deviceName || "Security Key",
        transports: credential.response?.transports || [],
      },
    });

    let recoveryCodes: string[] | undefined;
    if (isFirstCredential) {
      const plainCodes = generateRecoveryCodes();
      const hashedCodes = await hashRecoveryCodes(plainCodes);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { mfaEnabled: true, mfaMethod: "WEBAUTHN", recoveryCodes: hashedCodes },
      });
      recoveryCodes = plainCodes;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true, name: true },
    });
    await logAudit({
      organizationId: user!.organizationId,
      userId: session.user.id,
      userName: user!.name,
      entityType: "MFA",
      entityId: session.user.id,
      action: "CREATE",
      afterJson: { method: "WEBAUTHN", deviceName: deviceName || "Security Key" },
    });

    return NextResponse.json({ success: true, recoveryCodes });
  } catch (err) {
    console.error("[mfa/setup/webauthn/register] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
