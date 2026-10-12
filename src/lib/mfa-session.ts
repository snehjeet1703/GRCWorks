import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./db";

export type MfaSessionUser = { id: string; email: string; name: string; mfaPending: boolean };

export async function getMfaSessionUser(): Promise<MfaSessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  return { id: u.id, email: u.email, name: u.name, mfaPending: !!u.mfaPending };
}

// A login that hasn't passed MFA may only enrol a *first* factor (org-mandated MFA);
// it must never replace or remove an existing one, or a stolen password defeats MFA.
export function forbidIfPendingWithExistingMfa(user: MfaSessionUser, mfaEnabled: boolean) {
  if (user.mfaPending && mfaEnabled) {
    return NextResponse.json({ error: "Complete MFA verification first" }, { status: 403 });
  }
  return null;
}

export async function gatePendingEnrolment(sessionUser: { id: string; mfaPending?: boolean }) {
  if (!sessionUser.mfaPending) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { mfaEnabled: true } });
  return forbidIfPendingWithExistingMfa({ ...sessionUser, mfaPending: true } as MfaSessionUser, !!dbUser?.mfaEnabled);
}

export function forbidIfPending(user: MfaSessionUser) {
  if (user.mfaPending) {
    return NextResponse.json({ error: "Complete MFA verification first" }, { status: 403 });
  }
  return null;
}

// The only way a session's MFA gate can be cleared (see the jwt "update" callback).
export async function markMfaVerified(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { mfaVerifiedAt: new Date() } });
}
