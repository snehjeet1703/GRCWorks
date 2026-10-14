import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleError, parseBody, requirePermission, requireSession } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { portalBaseUrl } from "@/lib/vendor-portal";
import { TASK_PRIORITIES, TASK_STATUSES, assertTaskRefs, notifyAssignee, taskInclude } from "@/lib/tasks";

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().default(""),
  status: z.enum(TASK_STATUSES).optional().default("TODO"),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  controlId: z.string().uuid().nullable().optional(),
  riskId: z.string().uuid().nullable().optional(),
}).strict();

// scope=mine (default): tasks assigned to me — available to every signed-in user.
// scope=created: tasks I created.  scope=all: every task (needs "View all tasks").
export async function GET(req: Request) {
  try {
    const scope = new URL(req.url).searchParams.get("scope") ?? "mine";
    const user = scope === "all" ? await requirePermission(PERMISSIONS.TASKS_READ) : await requireSession();
    const where =
      scope === "all" ? { organizationId: user.organizationId }
      : scope === "created" ? { organizationId: user.organizationId, createdById: user.id }
      : { organizationId: user.organizationId, assigneeId: user.id };

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });
    return NextResponse.json(tasks);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.TASKS_MANAGE);
    const data = await parseBody(req, createSchema);
    await assertTaskRefs(user.organizationId, data);

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          organizationId: user.organizationId,
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          assigneeId: data.assigneeId ?? null,
          controlId: data.controlId ?? null,
          riskId: data.riskId ?? null,
          createdById: user.id,
          completedAt: data.status === "DONE" ? new Date() : null,
        },
        include: taskInclude,
      });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Task",
          entityId: created.id,
          entityName: created.title,
          action: "CREATE",
          afterJson: {
            title: created.title,
            status: created.status,
            priority: created.priority,
            assignee: created.assignee?.name ?? null,
            dueDate: created.dueDate,
          },
        },
        tx
      );
      return created;
    });

    const emailed = task.assigneeId ? await notifyAssignee(task.id, user.id, user.name, portalBaseUrl(req)) : false;
    return NextResponse.json({ ...task, emailed }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
