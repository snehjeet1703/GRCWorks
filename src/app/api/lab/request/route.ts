import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { labMode } from "@/lib/lab/content";

const schema = z.object({
  plan: z.enum(["individual", "bundle", "team"]),
  reference: z.string().trim().min(4, "Enter the UPI or bank reference number").max(100),
  amount: z.string().trim().max(50).default(""),
  note: z.string().trim().max(500).default(""),
}).strict();

// "I've paid": the learner sends their payment reference for an admin to check and approve.
export async function POST(req: Request) {
  try {
    if (!labMode) throw new HttpError(404, "Not found");
    const user = await requireSession();
    const limited = limitOrNull(`lab-request:${user.id}`, 5, 24 * 60 * 60 * 1000);
    if (limited) return limited;
    const d = await parseBody(req, schema);
    if (await prisma.labAccessRequest.findFirst({ where: { userId: user.id, status: "PENDING" } })) {
      throw new HttpError(409, "You already have a request waiting. We'll unlock your account once we've checked the payment.");
    }
    await prisma.labAccessRequest.create({ data: { userId: user.id, ...d } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
