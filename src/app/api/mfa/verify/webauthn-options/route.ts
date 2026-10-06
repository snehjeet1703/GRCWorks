import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId: session.user.id },
      select: { credentialId: true, transports: true },
    });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as any,
      })),
      userVerification: "preferred",
    });

    await prisma.mfaChallenge.create({
      data: {
        userId: session.user.id,
        type: "WEBAUTHN",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return NextResponse.json(options);
  } catch (err) {
    console.error("[mfa/verify/webauthn-options] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
