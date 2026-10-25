import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody, requireSession } from "@/lib/api";
import { labMode } from "@/lib/lab/content";
import { isLabAdmin, newCode } from "@/lib/lab/access";

async function requireLabAdmin() {
  if (!labMode) throw new HttpError(404, "Not found");
  const user = await requireSession();
  // Read live so removing someone from LAB_ADMIN_EMAILS takes effect at once.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!isLabAdmin(row?.email)) throw new HttpError(403, "Lab admins only");
  return { ...user, email: row!.email };
}

const createSchema = z.object({
  plan: z.enum(["individual", "bundle", "team"]),
  months: z.number().int().min(1).max(36),
  seats: z.number().int().min(1).max(500),
  count: z.number().int().min(1).max(100).default(1),
  redeemByDays: z.number().int().min(1).max(365).optional(),
  buyer: z.string().trim().max(200).default(""),
  managerEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(200)]).default(""),
  note: z.string().trim().max(500).default(""),
}).strict();

// Creates access codes to send to buyers after an offline payment. Team plans are one code with several seats.
export async function POST(req: Request) {
  try {
    const admin = await requireLabAdmin();
    const d = await parseBody(req, createSchema);
    if (d.plan !== "team" && d.seats !== 1) throw new HttpError(400, "Only team codes have more than one seat");
    if (d.plan === "team" && !d.managerEmail) throw new HttpError(400, "Team codes need the manager's email for the progress report");
    const redeemBy = d.redeemByDays ? new Date(Date.now() + d.redeemByDays * 86400000) : null;
    const codes = [];
    const count = d.plan === "team" ? 1 : (d.count ?? 1);
    for (let i = 0; i < count; i++) {
      codes.push(await prisma.labAccessCode.create({
        data: {
          code: newCode(), plan: d.plan, months: d.months, seats: d.seats, redeemBy, buyer: d.buyer,
          managerEmail: d.managerEmail, note: d.note, createdBy: admin.email,
        },
      }));
    }
    return NextResponse.json({ codes: codes.map((c) => c.code) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({ id: z.string().uuid(), disabled: z.boolean() }).strict();

// Disables (or re-enables) a code, e.g. after a refund. Access already granted is changed on the Learners list.
export async function PATCH(req: Request) {
  try {
    await requireLabAdmin();
    const { id, disabled } = await parseBody(req, patchSchema);
    await prisma.labAccessCode.update({ where: { id }, data: { disabled } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
