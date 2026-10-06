import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import { generateRecoveryCodes, hashRecoveryCodes } from "@/lib/mfa";
import { z } from "zod";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { password } = schema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, mfaEnabled: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.mfaEnabled) return NextResponse.json({ error: "MFA not enabled" }, { status: 400 });

    if (!(await compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    const plainCodes = generateRecoveryCodes();
    const hashedCodes = await hashRecoveryCodes(plainCodes);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { recoveryCodes: hashedCodes },
    });

    return NextResponse.json({ recoveryCodes: plainCodes });
  } catch (err) {
    console.error("[mfa/recovery-codes/regenerate] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
