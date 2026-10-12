import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { handleError, HttpError, parseBody } from "@/lib/api";
import { ensureBuiltInRoles } from "@/lib/built-in-roles";
import { slugify } from "@/lib/install-slug";
import { clientIp, limitOrNull } from "@/lib/rate-limit";

const setupSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(12, "Use at least 12 characters").max(200),
}).strict();

// Arbitrary constant key so concurrent first-run requests serialise.
const SETUP_LOCK_KEY = 815_001;

export async function POST(req: Request) {
  try {
    const limited = limitOrNull(`setup:${clientIp(req.headers)}`, 5, 3600000);
    if (limited) return limited;

    const data = await parseBody(req, setupSchema);
    const passwordHash = await hash(data.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
      if ((await tx.organization.count()) > 0) {
        throw new HttpError(409, "Setup has already been completed");
      }

      const org = await tx.organization.create({
        data: { name: data.organizationName, slug: slugify(data.organizationName) },
      });
      const roles = await ensureBuiltInRoles(tx, org.id);
      const admin = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: "ADMIN",
          roleId: roles.get("Admin") ?? null,
          organizationId: org.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: admin.id,
          userName: admin.name,
          entityType: "Organization",
          entityId: org.id,
          entityName: org.name,
          action: "CREATE",
          metadataJson: { event: "first_run_setup" },
        },
      });
      return { slug: org.slug };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
