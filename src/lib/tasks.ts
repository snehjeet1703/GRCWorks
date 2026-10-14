import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { sendTaskAssignedEmail } from "@/lib/email";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  control: { select: { id: true, code: true, title: true } },
  risk: { select: { id: true, title: true } },
} as const;

// Assignee, control and risk must all belong to the caller's organisation.
export async function assertTaskRefs(
  organizationId: string,
  refs: { assigneeId?: string | null; controlId?: string | null; riskId?: string | null }
) {
  const [assignee, control, risk] = await Promise.all([
    refs.assigneeId ? prisma.user.findFirst({ where: { id: refs.assigneeId, organizationId }, select: { id: true } }) : null,
    refs.controlId ? prisma.control.findFirst({ where: { id: refs.controlId, organizationId }, select: { id: true } }) : null,
    refs.riskId ? prisma.risk.findFirst({ where: { id: refs.riskId, organizationId }, select: { id: true } }) : null,
  ]);
  if (refs.assigneeId && !assignee) throw new HttpError(400, "Assignee isn't a member of this organisation");
  if (refs.controlId && !control) throw new HttpError(400, "Control not found");
  if (refs.riskId && !risk) throw new HttpError(400, "Risk not found");
}

// Emails the assignee; never fails the request, and skips people assigning themselves.
export async function notifyAssignee(taskId: string, assignerId: string, assignerName: string, baseUrl: string) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignee: true } });
    if (!task?.assignee || task.assignee.id === assignerId) return false;
    await sendTaskAssignedEmail(task.assignee.email, {
      assigneeName: task.assignee.name,
      assignerName,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      link: `${baseUrl}/tasks`,
    });
    return true;
  } catch (err) {
    console.error("[tasks] assignment email failed:", err);
    return false;
  }
}
