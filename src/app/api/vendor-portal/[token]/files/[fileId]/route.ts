import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { deleteUpload } from "@/lib/storage";
import { requireEditable, requirePortalSession } from "@/lib/vendor-portal";

export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  try {
    const { token, fileId } = await params;
    const r = await requirePortalSession(token);
    requireEditable(r);

    const file = await prisma.vendorResponseFile.findFirst({ where: { id: fileId, responseId: r.id } });
    if (!file) throw new HttpError(404, "File not found");

    await prisma.vendorResponseFile.delete({ where: { id: file.id } });
    await deleteUpload(file.storageKey);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
