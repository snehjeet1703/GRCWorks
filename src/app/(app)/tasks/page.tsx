import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { taskInclude } from "@/lib/tasks";
import { pendingControlWork } from "@/lib/control-work";
import { TasksClient, type TaskRow } from "./tasks-client";

// Open to everyone: each user always sees the tasks assigned to them.
export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const orgId: string = user.organizationId;
  const permissions: string[] = user.permissions ?? [];
  const canReadAll = permissions.includes("tasks:read");
  const canManage = permissions.includes("tasks:manage");

  const [tasks, users, controls, risks, controlWork] = await Promise.all([
    prisma.task.findMany({
      // Without "View all tasks", only your own and ones you created are loaded.
      where: canReadAll
        ? { organizationId: orgId }
        : { organizationId: orgId, OR: [{ assigneeId: user.id }, { createdById: user.id }] },
      include: taskInclude,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    canManage
      ? prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    canManage
      ? prisma.control.findMany({ where: { organizationId: orgId }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" } })
      : [],
    canManage
      ? prisma.risk.findMany({ where: { organizationId: orgId }, select: { id: true, title: true }, orderBy: { title: "asc" } })
      : [],
    // Owned controls that aren't closed: yours, or everyone's for people who can see all tasks.
    pendingControlWork(orgId, canReadAll ? undefined : user.id),
  ]);

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    createdBy: t.createdBy,
    control: t.control,
    risk: t.risk,
  }));

  return (
    <TasksClient
      tasks={rows}
      controlWork={controlWork}
      currentUserId={user.id}
      users={users}
      controls={controls}
      risks={risks}
      canReadAll={canReadAll}
      canManage={canManage}
    />
  );
}
