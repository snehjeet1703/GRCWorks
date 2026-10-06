import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/trust/", "/onboarding"];
const MFA_PREFIXES = ["/mfa-verify", "/api/mfa"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isMfaPath = MFA_PREFIXES.some((p) => pathname.startsWith(p));

  const token = await getToken({ req });

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token?.mfaPending && !isMfaPath && !isPublic) {
    return NextResponse.redirect(new URL("/mfa-verify", req.url));
  }

  if (token && !token.mfaPending && pathname === "/mfa-verify") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
