import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { compare } from "bcryptjs";
import { prisma } from "./db";
import { resolvePermissions } from "./permissions";
import { clientIp, rateLimit } from "./rate-limit";
import { azureSsoEnabled } from "./sso-config";

const PLACEHOLDER_SECRETS = new Set([
  "generate-a-random-secret-here",
  "my-grc-platform-secret-key-2026",
]);
const secret = process.env.NEXTAUTH_SECRET;
// `next build` loads this module too; a Docker image must not contain the secret, so only enforce at runtime.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (isBuildPhase) {
  // Checked when the server starts.
} else if (process.env.NODE_ENV === "production") {
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

const sessionHours = Number(process.env.SESSION_MAX_AGE_HOURS);
const sessionMaxAgeSeconds = Math.round((sessionHours > 0 && sessionHours <= 720 ? sessionHours : 12) * 3600);

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: sessionMaxAgeSeconds,
    // updateAge >= maxAge disables rolling renewal, so sessions end a fixed time after sign-in.
    updateAge: sessionMaxAgeSeconds,
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
        if (!user || !user.passwordHash || !user.canSignIn) return null;

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

        // Role and permissions are read live so role changes apply on the next page load,
        // not only after signing in again. API routes re-check the database as well.
        if (token.sub) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: {
              role: true,
              roleId: true,
              organizationId: true,
              canSignIn: true,
              organization: { select: { name: true } },
              customRole: { select: { name: true, permissions: true } },
              frameworkScopes: { select: { frameworkId: true } },
            },
          });
          if (dbUser) {
            const resolved = resolvePermissions(dbUser);
            // Live too, so a lab reset (which moves the learner to a fresh practice company) applies at once.
            (session.user as any).organizationId = dbUser.organizationId;
            (session.user as any).organizationName = dbUser.organization.name;
            if (!dbUser.canSignIn) (session.user as any).blocked = true;
            (session.user as any).role = dbUser.role;
            (session.user as any).roleId = dbUser.roleId;
            (session.user as any).permissions = [...resolved.permissions];
            (session.user as any).roleName = resolved.roleName;
            (session.user as any).frameworkScopeIds = resolved.frameworkScopeIds;
          } else {
            (session.user as any).permissions = [];
          }
        }
      }
      return session;
    },
  },
};
