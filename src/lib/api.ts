import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ZodError, ZodSchema } from "zod";
import { authOptions } from "./auth";
import { prisma } from "./db";
import {
  canAdmin,
  canEdit,
  resolvePermissions,
  hasPermission,
  permissionLabel,
  type Permission,
  type ResolvedPermissions,
} from "./permissions";
import { rateLimit, rateLimitHeaders } from "./rate-limit";
import type { UserRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roleId: string | null;
  organizationId: string;
  organizationName: string;
  permissions: string[];
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function checkApiRateLimit(userId: string) {
  const { ok, remaining, resetAt } = rateLimit(`api:${userId}`, 500, 60_000);
  if (!ok) {
    const res = NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
    for (const [k, v] of Object.entries(rateLimitHeaders(remaining, resetAt))) {
      res.headers.set(k, v);
    }
    throw res;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new HttpError(401, "Not authenticated");
  const user = session.user as SessionUser;
  checkApiRateLimit(user.id);
  return user;
}

export async function requireEditor(): Promise<SessionUser> {
  const user = await requireSession();
  if (!canEdit(user.role)) throw new HttpError(403, "Editor role required");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (!canAdmin(user.role)) throw new HttpError(403, "Admin role required");
  return user;
}

// Live DB permission check — reads the user's current role from the database,
// not the JWT cache. Use this for sensitive operations so role changes take
// effect immediately without requiring re-login.
export async function requirePermission(
  ...requiredPermissions: Permission[]
): Promise<SessionUser & { resolved: ResolvedPermissions }> {
  const sessionUser = await requireSession();

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      role: true,
      roleId: true,
      customRole: { select: { name: true, permissions: true } },
      frameworkScopes: { select: { frameworkId: true } },
    },
  });

  if (!dbUser) throw new HttpError(401, "User no longer exists");

  const resolved = resolvePermissions({
    role: dbUser.role,
    customRole: dbUser.customRole,
    frameworkScopes: dbUser.frameworkScopes,
  });

  for (const perm of requiredPermissions) {
    if (!hasPermission(resolved, perm)) {
      throw new HttpError(403, `Your role (${resolved.roleName}) doesn't allow this. It needs the "${permissionLabel(perm)}" permission; ask an admin.`);
    }
  }

  return { ...sessionUser, role: dbUser.role, roleId: dbUser.roleId, resolved };
}

// Live check of one permission for a user, without throwing.
export async function userHasPermission(userId: string, permission: Permission): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, customRole: { select: { name: true, permissions: true } } },
  });
  return !!dbUser && hasPermission(resolvePermissions(dbUser), permission);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new HttpError(400, "Validation failed", err.flatten());
    }
    throw err;
  }
}

// Multipart headers and other form fields on top of the file itself.
const FORM_OVERHEAD_BYTES = 1024 * 1024;

// Reads a multipart upload, refusing oversized bodies up front. Bodies over the proxy buffer
// (next.config.js proxyClientMaxBodySize) arrive truncated, so a parse failure is reported as a
// client error rather than a 500.
export async function readUploadForm(req: Request, maxFileBytes: number, tooLargeMessage: string): Promise<FormData> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxFileBytes + FORM_OVERHEAD_BYTES) {
    throw new HttpError(413, tooLargeMessage);
  }
  try {
    return await req.formData();
  } catch {
    throw new HttpError(400, `The upload could not be read. ${tooLargeMessage}`);
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof NextResponse) return err;
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, details: err.details },
      { status: err.status }
    );
  }
  console.error("[api] unexpected error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
