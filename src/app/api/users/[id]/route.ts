import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { diffChanges, logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]).optional(),
  roleId: z.string().uuid().nullable().optional(),
  password: z.string().min(8).max(200).optional(),
});

async function assertNotLastAdmin(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string
) {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, organizationId: true },
  });
  if (!target || target.organizationId !== orgId) return;
  if (target.role !== "ADMIN") return;
  const adminCount = await tx.user.count({
    where: { organizationId: orgId, role: "ADMIN" },
  });
  if (adminCount <= 1) {
    throw new HttpError(400, "Cannot remove or demote the last admin");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolved, ...admin } = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const { id } = await params;
    const data = await parseBody(req, updateSchema);
    const passwordHash = data.password ? await hash(data.password, 12) : undefined;

    const after = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, organizationId: admin.organizationId },
      });
      if (!before) throw new HttpError(404, "User not found");
      if (data.role && data.role !== "ADMIN") {
        await assertNotLastAdmin(tx, admin.organizationId, id);
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.roleId !== undefined) {
        if (data.roleId !== null) {
          const roleExists = await tx.role.findFirst({
            where: { id: data.roleId, organizationId: admin.organizationId },
          });
          if (!roleExists) throw new HttpError(400, "Role not found");
        }
        updateData.roleId = data.roleId;
      }
      if (passwordHash) updateData.passwordHash = passwordHash;

      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, email: true, name: true, role: true, roleId: true, customRole: { select: { id: true, name: true } }, createdAt: true },
      });

      const diff = diffChanges(
        { name: before.name, role: before.role },
        { name: updated.name, role: updated.role }
      );
      if (passwordHash) diff.passwordChanged = { from: false, to: true };
      if (Object.keys(diff).length > 0) {
        await logAudit(
          {
            organizationId: admin.organizationId,
            userId: admin.id,
            userName: admin.name,
            entityType: "User",
            entityId: id,
            entityName: updated.email,
            action: "UPDATE",
            changes: diff,
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
    const { resolved, ...admin } = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const { id } = await params;
    if (id === admin.id) throw new HttpError(400, "You cannot delete your own account");
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, organizationId: admin.organizationId },
      });
      if (!before) throw new HttpError(404, "User not found");
      await assertNotLastAdmin(tx, admin.organizationId, id);
      await tx.user.delete({ where: { id } });
      await logAudit(
        {
          organizationId: admin.organizationId,
          userId: admin.id,
          userName: admin.name,
          entityType: "User",
          entityId: id,
          entityName: before.email,
          action: "DELETE",
          changes: { email: before.email },
        },
        tx
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
