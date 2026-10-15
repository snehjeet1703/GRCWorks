import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { LOGO_MIME_TYPES } from "@/lib/trust-logo";

// Logo image response, or null when there's no (valid) logo. SVG is never served (LOGO_MIME_TYPES).
export async function logoResponse(storageKey: string | null, mimeType: string | null, cacheControl: string) {
  if (!storageKey || !mimeType || !LOGO_MIME_TYPES.has(mimeType)) return null;
  const data = await readUpload(storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": mimeType,
      "content-length": String(data.byteLength),
      "x-content-type-options": "nosniff",
      "cache-control": cacheControl,
    },
  });
}

/** Version for cache-busting the organisation logo URL, or null when it has none. */
export async function orgLogoVersion(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoStorageKey: true, logoUpdatedAt: true },
  });
  return org?.logoStorageKey ? (org.logoUpdatedAt?.getTime() ?? 1) : null;
}
