import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTotpCode, decryptSecret, verifyRecoveryCode } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";
import { limitOrNull } from "@/lib/rate-limit";
import { markMfaVerified } from "@/lib/mfa-session";
import { compare } from "bcryptjs";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { z } from "zod";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3002";

const totpSchema = z.object({ method: z.literal("TOTP"), code: z.string().length(6) });
const emailSchema = z.object({ method: z.literal("EMAIL_OTP"), code: z.string().length(6) });
const webauthnSchema = z.object({ method: z.literal("WEBAUTHN"), credential: z.any() });
const recoverySchema = z.object({ method: z.literal("RECOVERY"), code: z.string() });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 6-digit codes are guessable without a tight cap.
    const limited = limitOrNull(`mfa-verify:${session.user.id}`, 10, 15 * 60 * 1000);
    if (limited) return limited;

    const body = await req.json();
    const method = body.method;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        organizationId: true,
        mfaEnabled: true,
        mfaMethod: true,
        totpSecret: true,
        recoveryCodes: true,
        webauthnCredentials: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.mfaEnabled) {
      return NextResponse.json({ error: "MFA is not set up for this account" }, { status: 400 });
    }

    let verified = false;
    let auditMethod = method;

    if (method === "TOTP") {
      const { code } = totpSchema.parse(body);
      if (!user.totpSecret) return NextResponse.json({ error: "TOTP not configured" }, { status: 400 });
      verified = verifyTotpCode(decryptSecret(user.totpSecret), code);
    } else if (method === "EMAIL_OTP") {
      const { code } = emailSchema.parse(body);
      const challenge = await prisma.mfaChallenge.findFirst({
        where: { userId: user.id, type: "EMAIL_OTP", used: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (challenge?.code && (await compare(code, challenge.code))) {
        verified = true;
        await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { used: true } });
      }
    } else if (method === "WEBAUTHN") {
      const { credential } = webauthnSchema.parse(body);
      const challenge = await prisma.mfaChallenge.findFirst({
        where: { userId: user.id, type: "WEBAUTHN", used: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge?.challenge) return NextResponse.json({ error: "No pending challenge" }, { status: 400 });

      const credentialIdBase64 = credential.id;
      const storedCred = user.webauthnCredentials.find(
        (c) => c.credentialId === credentialIdBase64
      );
      if (!storedCred) return NextResponse.json({ error: "Unknown credential" }, { status: 400 });

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: storedCred.credentialId,
          publicKey: storedCred.publicKey,
          counter: Number(storedCred.counter),
        },
      });

      if (verification.verified) {
        verified = true;
        await prisma.webAuthnCredential.update({
          where: { id: storedCred.id },
          data: { counter: BigInt(verification.authenticationInfo.newCounter) },
        });
        await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { used: true } });
      }
    } else if (method === "RECOVERY") {
      const { code } = recoverySchema.parse(body);
      const hashedCodes = (user.recoveryCodes as string[]) || [];
      const result = await verifyRecoveryCode(code, hashedCodes);
      if (result.valid) {
        verified = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { recoveryCodes: result.remaining },
        });
        auditMethod = "RECOVERY";
      }
    } else {
      return NextResponse.json({ error: "Invalid method" }, { status: 400 });
    }

    if (!verified) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await markMfaVerified(user.id);

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userName: user.name,
      entityType: "MFA",
      entityId: user.id,
      action: "LOGIN",
      metadataJson: { method: auditMethod },
    });

    return NextResponse.json({ verified: true });
  } catch (err) {
    console.error("[mfa/verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
