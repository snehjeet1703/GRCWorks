import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

// UPLOAD_DIR pins the folder explicitly; the standalone server changes the working directory on start.
const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const USE_GCS = !!GCS_BUCKET;

function safeExt(fileName: string): string {
  const base = path.basename(fileName);
  const ext = path.extname(base).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.length > 10 ? "" : ext;
}

function validateKey(storageKey: string) {
  if (storageKey.includes("/") || storageKey.includes("\\") || storageKey.includes("..")) {
    throw new Error("Invalid storage key");
  }
}

let _gcsClient: import("@google-cloud/storage").Storage | null = null;
function getGcsClient() {
  if (!_gcsClient) {
    const { Storage } = require("@google-cloud/storage");
    _gcsClient = new Storage(
      process.env.GCS_KEY_FILE
        ? { keyFilename: process.env.GCS_KEY_FILE }
        : {}
    );
  }
  return _gcsClient!;
}

function gcsBucket() {
  return getGcsClient().bucket(GCS_BUCKET);
}

export type StoredFile = {
  storageKey: string;
  size: number;
};

export async function saveUpload(
  fileName: string,
  data: ArrayBuffer | Uint8Array
): Promise<StoredFile> {
  const key = `${randomUUID()}${safeExt(fileName)}`;
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (USE_GCS) {
    const file = gcsBucket().file(key);
    await file.save(Buffer.from(buf), {
      resumable: false,
      metadata: { contentType: mimeFromExt(safeExt(fileName)) },
    });
  } else {
    await mkdir(UPLOAD_ROOT, { recursive: true });
    await writeFile(path.join(UPLOAD_ROOT, key), buf);
  }

  return { storageKey: key, size: buf.byteLength };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  validateKey(storageKey);

  if (USE_GCS) {
    const [contents] = await gcsBucket().file(storageKey).download();
    return contents;
  }

  return readFile(path.join(UPLOAD_ROOT, storageKey));
}

export async function deleteUpload(storageKey: string): Promise<void> {
  if (storageKey.includes("/") || storageKey.includes("\\") || storageKey.includes("..")) return;

  if (USE_GCS) {
    try {
      await gcsBucket().file(storageKey).delete();
    } catch {
      // ignore missing
    }
  } else {
    try {
      await unlink(path.join(UPLOAD_ROOT, storageKey));
    } catch {
      // ignore missing
    }
  }
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".json": "application/json",
  };
  return map[ext] || "application/octet-stream";
}
