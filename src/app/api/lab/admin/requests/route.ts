import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { extendAccess, requireLabAdmin, type PaidPlan } from "@/lib/lab/access";

const schema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  plan: z.enum(["individual", "bundle", "team"]).optional(), // to correct what the learner picked
  months: z.number().int().min(1).max(36).optional(),
  note: z.string().trim().max(500).default(""),
}).strict();

// Approves (unlocking the learner straight away) or rejects an "I've paid" request.
export async function PATCH(req: Request) {
  try {
    const admin = await requireLabAdmin();
    const d = await parseBody(req, schema);
    const request = await prisma.labAccessRequest.findUnique({ where: { id: d.id } });
    if (!request) throw new HttpError(404, "Request not found");
    // Claim the request so two admins can't both approve it.
    const claimed = await prisma.labAccessRequest.updateMany({
      where: { id: d.id, status: "PENDING" },
      data: { status: d.decision, decidedBy: admin.email, decidedAt: new Date(), decisionNote: d.note, months: d.months ?? null },
    });
    if (claimed.count === 0) throw new HttpError(409, "Someone has already decided this request");
    if (d.decision === "APPROVED") {
      if (!d.months) throw new HttpError(400, "How many months?");
      await extendAccess(request.userId, (d.plan ?? request.plan) as PaidPlan, d.months, { note: `Payment ${request.reference}, approved by ${admin.email}` });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
