import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleError, HttpError } from "@/lib/api";
import { clientIp, limitOrNull } from "@/lib/rate-limit";
import { loadPortalResponse } from "@/lib/vendor-portal";
import { logoResponse } from "@/lib/org-logo";

// The requesting organisation's logo, for vendors holding a valid invite link.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = limitOrNull(`vp-logo:${clientIp(req.headers)}`, 60, 60_000);
    if (limited) return limited;
    const { token } = await params;
    const r = await loadPortalResponse(token);
    if (!r) throw new HttpError(404, "Not found");
    const org = await prisma.organization.findUnique({
      where: { id: r.questionnaire.organizationId },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    const res = await logoResponse(org?.logoStorageKey ?? null, org?.logoMimeType ?? null, "private, max-age=3600");
    return res ?? NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return handleError(err);
  }
}
