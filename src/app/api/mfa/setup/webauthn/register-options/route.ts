import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatePendingEnrolment } from "@/lib/mfa-session";
import { generateRegistrationOptions } from "@simplewebauthn/server";

const RP_NAME = process.env.WEBAUTHN_RP_NAME || "GRC Platform";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const pendingGate = await gatePendingEnrolment(session.user as any);
    if (pendingGate) return pendingGate;

    const existingCreds = await prisma.webAuthnCredential.findMany({
      where: { userId: session.user.id },
      select: { credentialId: true },
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: session.user.email,
      userDisplayName: session.user.name,
      attestationType: "none",
      excludeCredentials: existingCreds.map((c) => ({
        id: c.credentialId,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
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
    console.error("[mfa/setup/webauthn/register-options] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
