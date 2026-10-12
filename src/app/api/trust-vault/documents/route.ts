import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { saveUpload } from "@/lib/storage";
import { VIEWABLE_MIME_TYPES } from "@/lib/trust-access";

async function getConfigId(organizationId: string) {
  let config = await prisma.trustVaultConfig.findUnique({ where: { organizationId } });
  if (!config) config = await prisma.trustVaultConfig.create({ data: { organizationId } });
  return config.id;
}

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const configId = await getConfigId(user.organizationId);
    const docs = await prisma.trustVaultDocument.findMany({
      where: { configId, previousVersionId: null },
      orderBy: { sortOrder: "asc" },
      include: { accessGrants: { select: { accessRequestId: true } } },
    });
    return NextResponse.json(docs);
  } catch (err) {
    return handleError(err);
  }
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "image/png", "image/jpeg",
]);

const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0]],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [[0x50, 0x4b, 0x03, 0x04]],
};

function validateMagicBytes(buffer: Buffer, claimedType: string): boolean {
  const sigs = MAGIC_BYTES[claimedType];
  if (!sigs) return true;
  return sigs.some((sig) =>
    sig.every((byte, i) => i < buffer.length && buffer[i] === byte)
  );
}

const DANGEROUS_EXTENSIONS = /\.(exe|bat|cmd|com|msi|scr|pif|js|vbs|wsf|ps1|sh|php|html|htm|cgi|py|rb|pl)$/i;

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const configId = await getConfigId(user.organizationId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new HttpError(400, "File is required");
    if (file.size === 0) throw new HttpError(400, "Empty files are not allowed");
    if (file.size > MAX_FILE_SIZE) throw new HttpError(400, "File too large (max 50MB)");
    if (!ALLOWED_TYPES.has(file.type)) throw new HttpError(400, "File type not allowed");
    if (DANGEROUS_EXTENSIONS.test(file.name)) throw new HttpError(400, "File extension not allowed");

    const buffer = Buffer.from(await file.arrayBuffer());

    if (!validateMagicBytes(buffer, file.type)) {
      throw new HttpError(400, "File content does not match declared type");
    }

    const { storageKey, size } = await saveUpload(file.name, buffer);

    const name = (formData.get("name") as string) || file.name;
    const description = (formData.get("description") as string) || "";
    const category = (formData.get("category") as string) || "General";
    const visibility = (formData.get("visibility") as string) || "ACCESS_REQUIRED";
    const permission = (formData.get("permission") as string) || "VIEW_ONLY";
    if (permission === "VIEW_ONLY" && !VIEWABLE_MIME_TYPES.has(file.type)) {
      throw new HttpError(400, "Only PDFs and images can be view-only. Set this file to Downloadable or upload it as a PDF.");
    }
    const validUntilStr = formData.get("validUntil") as string | null;
    const validUntil = validUntilStr ? new Date(validUntilStr) : null;
    const replaceDocId = formData.get("replaceDocId") as string | null;

    let version = 1;
    let previousVersionId: string | null = null;

    if (replaceDocId) {
      const prev = await prisma.trustVaultDocument.findFirst({
        where: { id: replaceDocId, config: { organizationId: user.organizationId } },
      });
      if (!prev) throw new HttpError(404, "Document to replace not found");
      version = prev.version + 1;
      previousVersionId = prev.id;
      await prisma.trustVaultDocument.update({
        where: { id: prev.id },
        data: { enabled: false },
      });
    }

    const doc = await prisma.trustVaultDocument.create({
      data: {
        configId,
        name,
        description,
        category,
        fileName: file.name,
        storageKey,
        fileSize: size,
        mimeType: file.type,
        visibility: visibility as any,
        permission: permission as any,
        validUntil,
        ownerId: user.id,
        version,
        previousVersionId,
      },
    });

    await logAudit({
      organizationId: user.organizationId, userId: user.id,
      userName: user.name,
      entityType: "TrustVaultDocument", entityId: doc.id, action: "CREATE",
      afterJson: { name: doc.name, category, visibility, permission, version, validUntil },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
