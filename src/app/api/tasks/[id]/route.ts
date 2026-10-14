import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission, requireSession } from "@/lib/api";
import { logAudit, diffChanges } from "@/lib/audit";
import { PERMISSIONS, hasPermission, resolvePermissions } from "@/lib/permissions";
import { portalBaseUrl } from "@/lib/vendor-portal";
import { TASK_PRIORITIES, TASK_STATUSES, assertTaskRefs, notifyAssignee, taskInclude } from "@/lib/tasks";

const updateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  controlId: z.string().uuid().nullable().optional(),
  riskId: z.string().uuid().nullable().optional(),
}).strict();

async function canManageTasks(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, customRole: { select: { name: true, permissions: true } } },
  });
  return !!dbUser && hasPermission(resolvePermissions(dbUser), PERMISSIONS.TASKS_MANAGE);
}

// Managers can change anything; the assignee can only move their own task through its statuses.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const data = await parseBody(req, updateSchema);

    const before = await prisma.task.findFirst({ where: { id, organizationId: user.organizationId }, include: taskInclude });
    if (!before) throw new HttpError(404, "Task not found");

    const manager = await canManageTasks(user.id);
    if (!manager) {
      if (before.assigneeId !== user.id) {
        throw new HttpError(403, `Your role doesn't allow this. It needs the "Manage tasks" permission; ask an admin.`);
      }
      const otherFields = Object.keys(data).filter((k) => k !== "status");
      if (otherFields.length > 0) {
        throw new HttpError(403, "You can update the status of your own tasks. Ask a task manager to change anything else.");
      }
    }
    await assertTaskRefs(user.organizationId, data);

    const update: Record<string, unknown> = { ...data };
    if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.status !== undefined && data.status !== before.status) {
      update.completedAt = data.status === "DONE" ? new Date() : null;
    }

    const after = await prisma.$transaction(async (tx) => {
      const row = await tx.task.update({ where: { id }, data: update, include: taskInclude });
      const changes = diffChanges(
        { title: before.title, description: before.description, status: before.status, priority: before.priority,
          dueDate: before.dueDate?.toISOString() ?? null, assignee: before.assignee?.name ?? null,
          control: before.control?.code ?? null, risk: before.risk?.title ?? null },
        { title: row.title, description: row.description, status: row.status, priority: row.priority,
          dueDate: row.dueDate?.toISOString() ?? null, assignee: row.assignee?.name ?? null,
          control: row.control?.code ?? null, risk: row.risk?.title ?? null }
      );
      if (Object.keys(changes).length > 0) {
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Task",
            entityId: id,
            entityName: row.title,
            action: "UPDATE",
            changes,
          },
          tx
        );
      }
      return row;
    });

    const reassigned = !!after.assigneeId && after.assigneeId !== before.assigneeId;
    const emailed = reassigned ? await notifyAssignee(after.id, user.id, user.name, portalBaseUrl(req)) : false;
    return NextResponse.json({ ...after, emailed });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TASKS_MANAGE);
    const { id } = await params;
    const task = await prisma.task.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!task) throw new HttpError(404, "Task not found");

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Task",
          entityId: id,
          entityName: task.title,
          action: "DELETE",
          beforeJson: { title: task.title, status: task.status, assigneeId: task.assigneeId },
        },
        tx
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
