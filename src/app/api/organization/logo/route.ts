import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError, readUploadForm, requirePermission, requireSession } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { deleteUpload, readUpload, saveUpload } from "@/lib/storage";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, isValidLogo } from "@/lib/trust-logo";
import { limitOrNull } from "@/lib/rate-limit";

// The organisation's logo, shown in the portal for everyone signed in to it.
export async function GET() {
  try {
    const user = await requireSession();
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    if (!org?.logoStorageKey || !org.logoMimeType || !LOGO_MIME_TYPES.has(org.logoMimeType)) {
      throw new HttpError(404, "No logo");
    }
    const data = await readUpload(org.logoStorageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": org.logoMimeType,
        "x-content-type-options": "nosniff",
        // URLs carry ?v=<updatedAt>, so a new logo is a new URL.
        "cache-control": "private, max-age=86400",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const limited = limitOrNull(`org-logo:${user.id}`, 20, 10 * 60 * 1000);
    if (limited) return limited;

    const file = (await readUploadForm(req, LOGO_MAX_BYTES, "Logo too large (max 1 MB)")).get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Logo file is required");
    if (file.size > LOGO_MAX_BYTES) throw new HttpError(400, "Logo too large (max 1 MB)");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isValidLogo(buffer, file.type)) throw new HttpError(400, "Logo must be a PNG, JPEG or WebP image");

    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { logoStorageKey: true },
    });
    const { storageKey } = await saveUpload(file.name, buffer);
    const org = await prisma.organization.update({
      where: { id: user.organizationId },
      data: { logoStorageKey: storageKey, logoMimeType: file.type, logoUpdatedAt: new Date() },
      select: { logoUpdatedAt: true },
    });
    if (before.logoStorageKey) await deleteUpload(before.logoStorageKey);

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "Organization", entityId: user.organizationId, entityName: "Organization logo", action: "UPDATE",
      afterJson: { logo: file.name, mimeType: file.type, size: file.size },
    });
    return NextResponse.json({ hasLogo: true, version: org.logoUpdatedAt?.getTime() ?? Date.now() });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ORG_MANAGE);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { logoStorageKey: true },
    });
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { logoStorageKey: null, logoMimeType: null, logoUpdatedAt: new Date() },
    });
    if (org.logoStorageKey) await deleteUpload(org.logoStorageKey);
    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "Organization", entityId: user.organizationId, entityName: "Organization logo", action: "DELETE",
    });
    return NextResponse.json({ hasLogo: false });
  } catch (err) {
    return handleError(err);
  }
}
