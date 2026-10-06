import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
});

export async function GET() {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.USERS_READ);
    const roles = await prisma.role.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        isBuiltIn: true,
        permissions: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(roles);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ROLES_MANAGE);
    const data = await parseBody(req, createSchema);

    const role = await prisma.$transaction(async (tx) => {
      const existing = await tx.role.findUnique({
        where: { organizationId_name: { organizationId: user.organizationId, name: data.name } },
      });
      if (existing) {
        throw { status: 400, message: "A role with that name already exists" };
      }

      const created = await tx.role.create({
        data: {
          organizationId: user.organizationId,
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          isBuiltIn: false,
        },
        select: { id: true, name: true, description: true, isBuiltIn: true, permissions: true, createdAt: true },
      });

      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Role",
          entityId: created.id,
          entityName: created.name,
          action: "CREATE",
          changes: { permissions: data.permissions },
        },
        tx
      );

      return created;
    });

    return NextResponse.json(role, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
