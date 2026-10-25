import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// "/api/trust/" is the public trust page API; admin endpoints live under "/api/trust-vault".
// Vendor portal routes authenticate themselves (link token + email-verified cookie).
const PUBLIC_PREFIXES = [
  "/login", "/setup", "/api/setup", "/api/auth", "/trust/", "/api/trust/", "/onboarding",
  "/vendor-portal/", "/api/vendor-portal/", "/api/health",
  "/lab/signup", "/api/lab/signup", "/certificate/",
];
const MFA_PREFIXES = ["/mfa-verify", "/api/mfa"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API callers get a status code, not the HTML login page.
  const isApi = pathname.startsWith("/api/");

  // Static files (public/*.png etc.). API paths never skip the checks below, even with a dot in them.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    (!isApi && pathname.includes("."))
  ) {
    return NextResponse.next();
  }

  // Cross-site requests can't change anything: a browser-sent Origin must be this site.
  // (Session cookies are SameSite=Lax as well; this is a second line of defence for uploads and other writes.)
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== "null") {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      let originHost = "";
      try { originHost = new URL(origin).host; } catch {}
      if (!host || originHost !== host) {
        return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
      }
    } else if (origin === "null") {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isMfaPath = MFA_PREFIXES.some((p) => pathname.startsWith(p));

  const token = await getToken({ req });

  if (!token && !isPublic) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token?.mfaPending && !isMfaPath && !isPublic) {
    if (isApi) return NextResponse.json({ error: "MFA verification required" }, { status: 401 });
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
