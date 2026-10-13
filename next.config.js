/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Next.js injects inline bootstrap scripts, so script-src needs 'unsafe-inline' unless nonces are added.
// img-src allows https: because Trust Vault badges may use externally hosted icon URLs.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

const commonHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Trust Vault access tokens travel in query strings; never leak them to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

// The Trust Vault document viewer is the only resource framed (by our own trust page).
const VIEWER_PATH = "/api/trust/:slug/documents/:docId/view";

const pageHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  ...commonHeaders,
];

const viewerHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ...commonHeaders,
];

const nextConfig = {
  // Emits .next/standalone (server.js + only the traced node_modules) for a small Docker image.
  output: "standalone",
  // storage.ts reads ./uploads at runtime; never copy user files into the build output.
  outputFileTracingExcludes: { "/*": ["./uploads/**/*"] },
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  experimental: {
    // Middleware buffers request bodies up to this size (default 10 MB) and silently truncates
    // anything larger. The largest upload is a 50 MB Trust Vault document plus form overhead.
    proxyClientMaxBodySize: "52mb",
  },
  allowedDevOrigins: ["192.168.17.1"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!api/trust/[^/]+/documents/[^/]+/view).*)", headers: pageHeaders },
      { source: VIEWER_PATH, headers: viewerHeaders },
    ];
  },
};

module.exports = nextConfig;
