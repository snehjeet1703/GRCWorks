import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { deleteUpload, readUpload, saveUpload } from "@/lib/storage";
import { LOGO_MAX_BYTES, isValidLogo } from "@/lib/trust-logo";

async function getConfig(organizationId: string) {
  return (
    (await prisma.trustVaultConfig.findUnique({ where: { organizationId } })) ??
    (await prisma.trustVaultConfig.create({ data: { organizationId } }))
  );
}

// Admin preview: works even while the public trust page is disabled.
export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_READ);
    const config = await prisma.trustVaultConfig.findUnique({ where: { organizationId: user.organizationId } });
    if (!config?.logoStorageKey || !config.logoMimeType) throw new HttpError(404, "No logo");

    const data = await readUpload(config.logoStorageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": config.logoMimeType,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const config = await getConfig(user.organizationId);

    const file = (await req.formData()).get("file") as File | null;
    if (!file || file.size === 0) throw new HttpError(400, "Logo file is required");
    if (file.size > LOGO_MAX_BYTES) throw new HttpError(400, "Logo too large (max 1MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isValidLogo(buffer, file.type)) {
      throw new HttpError(400, "Logo must be a PNG, JPEG or WebP image");
    }

    const { storageKey } = await saveUpload(file.name, buffer);
    const previousKey = config.logoStorageKey;

    await prisma.trustVaultConfig.update({
      where: { id: config.id },
      data: { logoStorageKey: storageKey, logoMimeType: file.type },
    });
    if (previousKey) await deleteUpload(previousKey);

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustVaultConfig", entityId: config.id, action: "UPDATE",
      entityName: "Trust Vault logo",
      afterJson: { logo: file.name, mimeType: file.type, size: file.size },
    });

    return NextResponse.json({ hasLogo: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TRUST_VAULT_MANAGE);
    const config = await getConfig(user.organizationId);
    if (!config.logoStorageKey) return NextResponse.json({ hasLogo: false });

    await prisma.trustVaultConfig.update({
      where: { id: config.id },
      data: { logoStorageKey: null, logoMimeType: null },
    });
    await deleteUpload(config.logoStorageKey);

    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "TrustVaultConfig", entityId: config.id, action: "DELETE",
      entityName: "Trust Vault logo",
    });

    return NextResponse.json({ hasLogo: false });
  } catch (err) {
    return handleError(err);
  }
}
