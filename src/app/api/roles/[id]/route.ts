import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit, snapshotEntity } from "@/lib/audit";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ROLES_MANAGE);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);

    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.role.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!before) throw new HttpError(404, "Role not found");
      if (before.isBuiltIn && data.name && data.name !== before.name) {
        throw new HttpError(400, "Cannot rename a built-in role");
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.permissions !== undefined) updateData.permissions = data.permissions;

      const updated = await tx.role.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, description: true, isBuiltIn: true, permissions: true, createdAt: true },
      });

      const diff: Record<string, unknown> = {};
      if (data.name !== undefined && data.name !== before.name) {
        diff.name = { from: before.name, to: updated.name };
      }
      if (data.description !== undefined && data.description !== before.description) {
        diff.description = { from: before.description, to: updated.description };
      }
      if (data.permissions) {
        const beforePerms = (before.permissions as string[]) || [];
        const afterPerms = data.permissions;
        const added = afterPerms.filter((p) => !beforePerms.includes(p));
        const removed = beforePerms.filter((p) => !afterPerms.includes(p));
        if (added.length > 0 || removed.length > 0) {
          diff.permissions = { added, removed };
        }
      }

      const ROLE_SNAP_KEYS = ["name", "description", "permissions"];
      if (Object.keys(diff).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Role",
            entityId: id,
            entityName: updated.name,
            action: "UPDATE",
            changes: diff,
            beforeJson: snapshotEntity(before as any, ROLE_SNAP_KEYS),
            afterJson: snapshotEntity(updated as any, ROLE_SNAP_KEYS),
          },
          tx
        );
      }

      return updated;
    });

    return NextResponse.json(after);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.ROLES_MANAGE);
    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { _count: { select: { users: true } } },
      });
      if (!role) throw new HttpError(404, "Role not found");
      if (role.isBuiltIn) throw new HttpError(400, "Cannot delete a built-in role");
      if (role._count.users > 0) {
        throw new HttpError(400, `Cannot delete role "${role.name}" — ${role._count.users} user(s) still assigned`);
      }

      await tx.role.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Role",
          entityId: id,
          entityName: role.name,
          action: "DELETE",
          changes: { name: role.name },
        },
        tx
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
