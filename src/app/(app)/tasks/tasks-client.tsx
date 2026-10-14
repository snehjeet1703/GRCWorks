"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, Pencil, Trash2, UserRound, Inbox, Send, ListTodo, CalendarClock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, TextInput, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { PageTabs } from "@/components/page-tabs";
import { useToast } from "@/components/toast";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  control: { id: string; code: string; title: string } | null;
  risk: { id: string; title: string } | null;
};

const STATUSES = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
] as const;
const PRIORITIES = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const statusStyle: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  BLOCKED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DONE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};
const priorityStyle: Record<string, string> = {
  URGENT: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  MEDIUM: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  LOW: "bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400",
};

const DAY = 86400000;

// Due dates are calendar days stored at 12:00 UTC, so they read as the same day in every time zone.
const dueDay = (iso: string) => iso.slice(0, 10);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// Fixed locale and zone so server and browser render identical text.
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// `today` is null until the page has mounted; relative wording is browser-only to avoid hydration mismatches.
function dueInfo(t: TaskRow, today: string | null) {
  if (!t.dueDate) return { label: "—", tone: "text-gray-500" };
  if (t.status === "DONE" || !today) return { label: formatDate(t.dueDate), tone: t.status === "DONE" ? "text-gray-500" : "text-gray-600" };
  const days = daysBetween(today, dueDay(t.dueDate));
  if (days < 0) return { label: `${formatDate(t.dueDate)} · ${-days}d overdue`, tone: "text-red-600 font-medium" };
  if (days === 0) return { label: "Today", tone: "text-amber-600 font-medium" };
  if (days <= 7) return { label: `${formatDate(t.dueDate)} · in ${days}d`, tone: "text-amber-600" };
  return { label: formatDate(t.dueDate), tone: "text-gray-600" };
}

type Form = {
  title: string; description: string; status: string; priority: string;
  dueDate: string; assigneeId: string; controlId: string; riskId: string;
};
const emptyForm = (assigneeId = ""): Form => ({
  title: "", description: "", status: "TODO", priority: "MEDIUM", dueDate: "", assigneeId, controlId: "", riskId: "",
});

export function TasksClient({
  tasks, currentUserId, users, controls, risks, canReadAll, canManage,
}: {
  tasks: TaskRow[];
  currentUserId: string;
  users: { id: string; name: string }[];
  controls: { id: string; code: string; title: string }[];
  risks: { id: string; title: string }[];
  canReadAll: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const [tab, setTab] = useState("mine");
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localToday()), []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [showDone, setShowDone] = useState(false);

  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskRow | null>(null);

  const mine = tasks.filter((t) => t.assignee?.id === currentUserId);
  const created = tasks.filter((t) => t.createdBy?.id === currentUserId);
  const openCount = (list: TaskRow[]) => list.filter((t) => t.status !== "DONE").length;

  const tabs = [
    { key: "mine", label: `My tasks (${openCount(mine)})`, icon: Inbox },
    ...(canManage ? [{ key: "created", label: `Created by me (${openCount(created)})`, icon: Send }] : []),
    ...(canReadAll ? [{ key: "all", label: `All tasks (${openCount(tasks)})`, icon: ListTodo }] : []),
  ];
  const scoped = tab === "created" ? created : tab === "all" ? tasks : mine;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped
      .filter((t) => {
        if (statusFilter ? t.status !== statusFilter : !showDone && t.status === "DONE") return false;
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (assigneeFilter && (assigneeFilter === "none" ? t.assignee : t.assignee?.id !== assigneeFilter)) return false;
        if (q && ![t.title, t.description, t.control?.code, t.risk?.title, t.assignee?.name]
          .some((v) => v?.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => {
        if ((a.status === "DONE") !== (b.status === "DONE")) return a.status === "DONE" ? 1 : -1;
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
  }, [scoped, search, statusFilter, priorityFilter, assigneeFilter, showDone]);

  const open = scoped.filter((t) => t.status !== "DONE");
  const daysLeft = (t: TaskRow) => (today && t.dueDate ? daysBetween(today, dueDay(t.dueDate)) : null);
  const overdue = open.filter((t) => (daysLeft(t) ?? 0) < 0).length;
  const dueSoon = open.filter((t) => { const d = daysLeft(t); return d !== null && d >= 0 && d <= 7; }).length;
  const doneCount = scoped.length - open.length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(tab === "mine" ? currentUserId : ""));
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: TaskRow) {
    setEditing(t);
    setForm({
      title: t.title, description: t.description, status: t.status, priority: t.priority,
      dueDate: t.dueDate ? dueDay(t.dueDate) : "",
      assigneeId: t.assignee?.id ?? "", controlId: t.control?.id ?? "", riskId: t.risk?.id ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the task a title.");
    setSaving(true);
    setError(null);
    const body = {
      title: form.title.trim(),
      description: form.description,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate ? `${form.dueDate}T12:00:00.000Z` : null,
      assigneeId: form.assigneeId || null,
      controlId: form.controlId || null,
      riskId: form.riskId || null,
    };
    const res = await fetch(editing ? `/api/tasks/${editing.id}` : "/api/tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data?.error ?? "Couldn't save the task");
    setModalOpen(false);
    const who = users.find((u) => u.id === body.assigneeId)?.name;
    toast.success(
      editing ? "Task updated." : who && body.assigneeId !== currentUserId
        ? `Task assigned to ${who}${data.emailed ? " — they've been emailed" : ""}.`
        : "Task created."
    );
    refresh();
  }

  async function setStatus(t: TaskRow, status: string) {
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Couldn't update the task");
      return;
    }
    if (status === "DONE") toast.success(`Completed "${t.title}".`);
    refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const t = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Couldn't delete the task");
      return;
    }
    toast.success(`Deleted "${t.title}".`);
    refresh();
  }

  const canChangeStatus = (t: TaskRow) => canManage || t.assignee?.id === currentUserId;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">Work assigned to you and your team, linked to the controls and risks it&apos;s for.</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New task
          </button>
        )}
      </div>

      <PageTabs tabs={tabs} activeTab={tab} onTabChange={(k) => { setTab(k); setAssigneeFilter(""); }} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={open.length} tone="text-gray-900 dark:text-gray-100" />
        <Stat label="Overdue" value={overdue} tone="text-red-600" />
        <Stat label="Due this week" value={dueSoon} tone="text-amber-600" />
        <Stat label="Done" value={doneCount} tone="text-green-700" />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tasks, controls, risks or people…"
        selects={[
          { label: "Status", value: statusFilter, onChange: setStatusFilter, options: STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { label: "Priority", value: priorityFilter, onChange: setPriorityFilter, options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })) },
          ...(tab !== "mine" && canManage
            ? [{ label: "Assignee", value: assigneeFilter, onChange: setAssigneeFilter, options: [{ value: "none", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))] }]
            : []),
        ]}
        right={
          !statusFilter && (
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-gray-600">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
              Show completed
            </label>
          )
        }
      />

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Status", "Task", "Priority", "Due", tab === "mine" ? "From" : "Assignee", ""].map((h, i) => (
                  <th key={i} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((t) => {
                const due = dueInfo(t, today);
                return (
                  <tr key={t.id} className={`transition-colors hover:bg-muted/50 ${t.status === "DONE" ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 align-top">
                      {canChangeStatus(t) ? (
                        <select
                          value={t.status}
                          onChange={(e) => setStatus(t, e.target.value)}
                          aria-label={`Status of ${t.title}`}
                          className={`cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-7 text-xs font-medium ${statusStyle[t.status]}`}
                        >
                          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                          {STATUSES.find((s) => s.value === t.status)?.label}
                        </span>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3 align-top">
                      <p className={`font-medium text-gray-900 dark:text-gray-100 ${t.status === "DONE" ? "line-through" : ""}`}>{t.title}</p>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.description}</p>}
                      {(t.control || t.risk) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {t.control && (
                            <a href="/controls" title={t.control.title}
                              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              <ShieldCheck className="h-3 w-3" /> {t.control.code}
                            </a>
                          )}
                          {t.risk && (
                            <a href="/risks" title="Linked risk"
                              className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              <TriangleAlert className="h-3 w-3 shrink-0" /> <span className="truncate">{t.risk.title}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${priorityStyle[t.priority]}`}>
                        {PRIORITIES.find((p) => p.value === t.priority)?.label}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 align-top text-xs ${due.tone}`}>
                      {t.dueDate && t.status !== "DONE" && today && <CalendarClock className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />}
                      {due.label}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-gray-600 dark:text-gray-400">
                      {tab === "mine"
                        ? t.createdBy?.name ?? "—"
                        : t.assignee
                          ? <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-gray-400" />{t.assignee.id === currentUserId ? "You" : t.assignee.name}</span>
                          : <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(t)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Edit ${t.title}`}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(t)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${t.title}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-gray-400">
            <CheckSquare className="mb-2 h-8 w-8" />
            <p className="text-sm">
              {scoped.length === 0
                ? tab === "mine" ? "Nothing is assigned to you right now." : "No tasks yet."
                : "No tasks match these filters."}
            </p>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit task" : "New task"} size="md">
        <form onSubmit={save} className="space-y-4">
          <FormError message={error} />
          <Field label="Title" htmlFor="taskTitle">
            <TextInput id="taskTitle" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Collect Q4 access review evidence" autoFocus />
          </Field>
          <Field label="Description" htmlFor="taskDesc" hint="Optional. What needs doing and what 'done' looks like.">
            <TextArea id="taskDesc" value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assign to" htmlFor="taskAssignee">
              <Select id="taskAssignee" value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? `${u.name} (you)` : u.name}</option>)}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="taskDue">
              <input id="taskDue" type="date" className="input" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </Field>
            <Field label="Priority" htmlFor="taskPriority">
              <Select id="taskPriority" value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="taskStatus">
              <Select id="taskStatus" value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Related control" htmlFor="taskControl">
              <Select id="taskControl" value={form.controlId} onChange={(e) => set({ controlId: e.target.value })}>
                <option value="">None</option>
                {controls.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </Select>
            </Field>
            <Field label="Related risk" htmlFor="taskRisk">
              <Select id="taskRisk" value={form.riskId} onChange={(e) => set({ riskId: e.target.value })}>
                <option value="">None</option>
                {risks.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </Select>
            </Field>
          </div>
          {!editing && form.assigneeId && form.assigneeId !== currentUserId && (
            <p className="text-xs text-gray-500">They&apos;ll see it under My tasks and get an email.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : editing ? "Save" : "Create task"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete task"
        message={`Delete "${deleteTarget?.title}"? This can't be undone.`}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card !px-4 !py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
