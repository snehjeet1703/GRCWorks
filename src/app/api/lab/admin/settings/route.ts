import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { labContent } from "@/lib/lab/content";
import { requireLabAdmin } from "@/lib/lab/access";

const schema = z.object({
  pricingText: z.string().trim().max(1000),
  paymentText: z.string().trim().max(1000),
  upiId: z.union([z.literal(""), z.string().trim().regex(/^[\w.\-]{2,64}@[A-Za-z]{2,32}$/, "That doesn't look like a UPI ID (name@bank)")]),
  freeLabs: z.record(z.string().max(64), z.array(z.string().max(64)).max(50)),
  defaultMonths: z.number().int().min(1).max(36),
  signupOpen: z.boolean(),
  admins: z.array(z.string().trim().toLowerCase().email().max(200)).max(20),
}).strict();

export async function PUT(req: Request) {
  try {
    const admin = await requireLabAdmin();
    const d = await parseBody(req, schema);
    // Only real courses and labs can be made free.
    const courses = (await labContent()).courses;
    for (const [courseId, labs] of Object.entries(d.freeLabs)) {
      const course = courses.find((c) => c.id === courseId);
      if (!course) throw new HttpError(400, `Unknown course ${courseId}`);
      for (const l of labs) if (!course.labs.some((x) => x.id === l)) throw new HttpError(400, `Unknown lab ${l}`);
    }
    const data = { ...d, admins: [...new Set(d.admins)], updatedBy: admin.email };
    await prisma.labSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
