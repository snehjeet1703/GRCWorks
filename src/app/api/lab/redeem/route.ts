import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";
import { redeemCode } from "@/lib/lab/access";

const schema = z.object({ code: z.string().trim().min(8).max(32) }).strict();

export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    // Codes are 12 random characters, but guessing is still limited per account.
    const limited = limitOrNull(`lab-redeem:${user.id}`, 10, 60 * 60 * 1000);
    if (limited) return limited;
    const { code } = await parseBody(req, schema);
    const access = await redeemCode(user.id, code);
    return NextResponse.json({ plan: access.plan, expiresAt: access.expiresAt });
  } catch (err) {
    return handleError(err);
  }
}
