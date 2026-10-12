import path from "path";
import { HttpError } from "./api";

// External uploads are untrusted: no SVG (script), HTML or archives (zip bombs, hidden executables).
export const VENDOR_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const VENDOR_UPLOAD_MAX_FILES = 50;

const ALLOWED: Record<string, { mime: string[]; magic?: number[] }> = {
  ".pdf": { mime: ["application/pdf"], magic: [0x25, 0x50, 0x44, 0x46] },
  ".png": { mime: ["image/png"], magic: [0x89, 0x50, 0x4e, 0x47] },
  ".jpg": { mime: ["image/jpeg"], magic: [0xff, 0xd8, 0xff] },
  ".jpeg": { mime: ["image/jpeg"], magic: [0xff, 0xd8, 0xff] },
  ".docx": { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], magic: [0x50, 0x4b, 0x03, 0x04] },
  ".xlsx": { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], magic: [0x50, 0x4b, 0x03, 0x04] },
  ".csv": { mime: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  ".txt": { mime: ["text/plain"] },
};

export const VENDOR_UPLOAD_ACCEPT = Object.keys(ALLOWED).join(",");

export function assertVendorUpload(fileName: string, mime: string, data: Uint8Array) {
  if (data.byteLength === 0) throw new HttpError(400, "File is empty");
  if (data.byteLength > VENDOR_UPLOAD_MAX_BYTES) throw new HttpError(400, "File is larger than 20 MB");
  const ext = path.extname(fileName).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) throw new HttpError(400, `"${ext || "(no extension)"}" files are not accepted. Use PDF, Word, Excel, CSV, text or images.`);
  if (mime && mime !== "application/octet-stream" && !rule.mime.includes(mime)) {
    throw new HttpError(400, "File type does not match its extension");
  }
  if (rule.magic && !rule.magic.every((b, i) => data[i] === b)) {
    throw new HttpError(400, "File content does not match its extension");
  }
}

export function safeDisplayName(fileName: string) {
  return path.basename(fileName).replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 200) || "file";
}
