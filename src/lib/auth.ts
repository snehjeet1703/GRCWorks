import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { compare } from "bcryptjs";
import { prisma } from "./db";
import { resolvePermissions } from "./permissions";
import { clientIp, rateLimit } from "./rate-limit";

const PLACEHOLDER_SECRETS = new Set([
  "generate-a-random-secret-here",
  "my-grc-platform-secret-key-2026",
]);
const secret = process.env.NEXTAUTH_SECRET;
if (process.env.NODE_ENV === "production") {
  if (!secret || PLACEHOLDER_SECRETS.has(secret) || secret.length < 32) {
    throw new Error(
      "NEXTAUTH_SECRET is missing, still the placeholder, or too short. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\""
    );
  }
} else if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
  console.warn(
    "[auth] NEXTAUTH_SECRET is missing or is the placeholder. " +
      "Regenerate before deploying to production."
  );
}

// SSO auto-provisions users, so it must be pinned to the organisation's own tenant.
// Multi-tenant authorities would let any Microsoft account in.
const azureTenant = process.env.AZURE_AD_TENANT_ID?.trim().toLowerCase() ?? "";
const azureSsoEnabled =
  !!process.env.AZURE_AD_CLIENT_ID && !!azureTenant && !["common", "organizations", "consumers"].includes(azureTenant);
if (process.env.AZURE_AD_CLIENT_ID && !azureSsoEnabled) {
  console.error(
    "[auth] Microsoft SSO disabled: AZURE_AD_TENANT_ID must be your organisation's tenant ID, not common/organizations/consumers."
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(azureSsoEnabled
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID!,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
            tenantId: process.env.AZURE_AD_TENANT_ID!,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Per-account limit stops guessing one password; per-IP limit stops credential stuffing across accounts.
        const window = 15 * 60 * 1000;
        const ip = clientIp((req?.headers ?? {}) as Record<string, string>);
        const byAccount = rateLimit(`login:${credentials.email.toLowerCase()}`, 10, window);
        const byIp = rateLimit(`login-ip:${ip}`, 30, window);
        if (!byAccount.ok || !byIp.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            organization: true,
            customRole: { select: { name: true, permissions: true } },
            frameworkScopes: { select: { frameworkId: true } },
          },
        });
        if (!user || !user.passwordHash) return null;

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        const resolved = resolvePermissions({
          role: user.role,
          customRole: user.customRole,
          frameworkScopes: user.frameworkScopes,
        });

        const mfaPending = user.mfaEnabled || user.organization.mfaRequired;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          roleId: user.roleId,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          permissions: [...resolved.permissions],
          roleName: resolved.roleName,
          frameworkScopeIds: resolved.frameworkScopeIds,
          mfaPending,
          mfaMethod: user.mfaMethod,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "azure-ad" && user.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          const org = await prisma.organization.findFirst();
          if (!org) return false;
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || user.email.split("@")[0],
              organizationId: org.id,
              role: "VIEWER",
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      if (account?.provider === "azure-ad" && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: {
            organization: true,
            customRole: { select: { name: true, permissions: true } },
            frameworkScopes: { select: { frameworkId: true } },
          },
        });
        if (dbUser) {
          const resolved = resolvePermissions({
            role: dbUser.role,
            customRole: dbUser.customRole,
            frameworkScopes: dbUser.frameworkScopes,
          });
          token.sub = dbUser.id;
          token.role = dbUser.role;
          token.roleId = dbUser.roleId;
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization.name;
          token.permissions = [...resolved.permissions];
          token.roleName = resolved.roleName;
          token.frameworkScopeIds = resolved.frameworkScopeIds;
          token.mfaPending = false;
          token.mfaMethod = dbUser.mfaMethod as any;
          token.authTime = Date.now();
        }
      } else if (user) {
        token.authTime = Date.now();
        token.role = (user as any).role;
        token.roleId = (user as any).roleId;
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        token.permissions = (user as any).permissions;
        token.roleName = (user as any).roleName;
        token.frameworkScopeIds = (user as any).frameworkScopeIds;
        token.mfaPending = (user as any).mfaPending;
        token.mfaMethod = (user as any).mfaMethod;
      }
      // The browser can only *ask* to clear the MFA gate; it clears only if the server
      // recorded a successful MFA check after this login (see markMfaVerified).
      if (trigger === "update" && session?.mfaPending === false && token.mfaPending && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { mfaVerifiedAt: true, mfaMethod: true },
        });
        const authTime = typeof token.authTime === "number" ? token.authTime : Infinity;
        if (dbUser?.mfaVerifiedAt && dbUser.mfaVerifiedAt.getTime() >= authTime) {
          token.mfaPending = false;
          token.mfaMethod = dbUser.mfaMethod as any;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).roleId = token.roleId;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        (session.user as any).permissions = token.permissions;
        (session.user as any).roleName = token.roleName;
        (session.user as any).frameworkScopeIds = token.frameworkScopeIds;
        (session.user as any).mfaPending = token.mfaPending;
        (session.user as any).mfaMethod = token.mfaMethod;
      }
      return session;
    },
  },
};
