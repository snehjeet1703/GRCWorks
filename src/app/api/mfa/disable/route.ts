import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { limitOrNull } from "@/lib/rate-limit";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as any).mfaPending) {
      return NextResponse.json({ error: "Complete MFA verification first" }, { status: 403 });
    }
    const limited = limitOrNull(`mfa-password:${session.user.id}`, 5, 15 * 60 * 1000);
    if (limited) return limited;

    const body = await req.json();
    const { password } = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, organizationId: true, name: true, mfaMethod: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!(await compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { mfaRequired: true },
    });
    if (org?.mfaRequired) {
      return NextResponse.json(
        { error: "MFA is required by your organization and cannot be disabled" },
        { status: 403 }
      );
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          mfaEnabled: false,
          mfaMethod: null,
          totpSecret: null,
          totpVerifiedAt: null,
          recoveryCodes: null,
        },
      }),
      prisma.webAuthnCredential.deleteMany({ where: { userId: session.user.id } }),
    ]);

    await logAudit({
      organizationId: user.organizationId,
      userId: session.user.id,
      userName: user.name,
      entityType: "MFA",
      entityId: session.user.id,
      action: "DELETE",
      beforeJson: { method: user.mfaMethod },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[mfa/disable] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
