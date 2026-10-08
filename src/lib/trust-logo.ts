// SVG is excluded on purpose: it can carry script when opened directly from our origin.
export const LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const LOGO_MAX_BYTES = 1024 * 1024;

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

export function isValidLogo(buffer: Buffer, mimeType: string): boolean {
  return LOGO_MIME_TYPES.has(mimeType) && (SIGNATURES[mimeType]?.(buffer) ?? false);
}
