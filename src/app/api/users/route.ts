import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).optional().default("VIEWER"),
  roleId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.USERS_READ);
    const users = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        customRole: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...admin } = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const data = await parseBody(req, createSchema);
    const passwordHash = await hash(data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: data.email } });
      if (existing) throw new HttpError(400, "A user with that email already exists");
      if (data.roleId) {
        const roleExists = await tx.role.findFirst({
          where: { id: data.roleId, organizationId: admin.organizationId },
        });
        if (!roleExists) throw new HttpError(400, "Role not found");
      }
      const created = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: data.role,
          roleId: data.roleId ?? null,
          organizationId: admin.organizationId,
        },
        select: { id: true, email: true, name: true, role: true, roleId: true, customRole: { select: { id: true, name: true } }, createdAt: true },
      });
      await logAudit(
        {
          organizationId: admin.organizationId,
          userId: admin.id,
          userName: admin.name,
          entityType: "User",
          entityId: created.id,
          entityName: created.email,
          action: "CREATE",
          changes: { email: created.email, role: created.role },
        },
        tx
      );
      return created;
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
