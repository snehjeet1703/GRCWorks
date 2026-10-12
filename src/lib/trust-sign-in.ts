import { prisma } from "@/lib/db";

export const TRUST_OTP_TTL_MS = 10 * 60 * 1000;
export const TRUST_OTP_MAX_ATTEMPTS = 5;

// The customer's most recent approval that still grants access, if any.
export async function findActiveGrant(slug: string, email: string) {
  const r = await prisma.trustAccessRequest.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "APPROVED",
      accessTokenHash: { not: null },
      OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { gt: new Date() } }],
      config: { enabled: true, organization: { slug } },
    },
    orderBy: { reviewedAt: "desc" },
    select: {
      id: true, email: true, otpHash: true, otpExpiresAt: true, otpAttempts: true,
      config: { select: { organization: { select: { id: true, name: true } } } },
    },
  });
  if (!r) return null;
  const { config, ...rest } = r;
  return { ...rest, organizationId: config.organization.id, organizationName: config.organization.name };
}
