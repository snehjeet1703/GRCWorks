"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, Pencil, Trash2, UserRound, Inbox, Send, ListTodo, CalendarClock, ShieldCheck, TriangleAlert, Upload, PlayCircle, CheckCircle2, Send as SendIcon, Undo2, XCircle, Download, MessageSquareWarning, ClipboardCheck, CalendarRange } from "lucide-react";
import type { ControlWorkItem } from "@/lib/control-work";
import type { SlotWorkItem } from "@/lib/audit-periods";
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

const CONTROL_REASON: Record<string, { label: string; style: string }> = {
  NOT_STARTED: { label: "Not started", style: statusStyle.TODO },
  IN_PROGRESS: { label: "In progress", style: statusStyle.IN_PROGRESS },
  NEEDS_EVIDENCE: { label: "Evidence expired", style: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  IN_REVIEW: { label: "Waiting for review", style: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  CHANGES_REQUESTED: { label: "Changes requested", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
};

const SLOT_TASK_STATUS: Record<string, { label: string; style: string }> = {
  DUE: { label: "Evidence due", style: statusStyle.TODO },
  OVERDUE: { label: "Overdue", style: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  READY: { label: "Ready to submit", style: statusStyle.IN_PROGRESS },
  CHANGES_REQUESTED: { label: "Changes requested", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  IN_REVIEW: { label: "Waiting for review", style: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
};

const EVIDENCE_TONE: Record<string, string> = {
  VALID: "text-green-700", EXPIRING: "text-amber-600", EXPIRED: "text-red-600", REJECTED: "text-red-600", PENDING: "text-gray-500",
};

export function TasksClient({
  tasks, controlWork, reviewQueue, slotWork, slotReviews, approvalRequired, currentUserId, users, controls, risks, canReadAll, canManage,
}: {
  tasks: TaskRow[];
  controlWork: ControlWorkItem[];
  reviewQueue: ControlWorkItem[];
  slotWork: SlotWorkItem[];
  slotReviews: SlotWorkItem[];
  approvalRequired: boolean;
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
  const [uploadFor, setUploadFor] = useState<ControlWorkItem | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyControl, setBusyControl] = useState<string | null>(null);
  const [sendBack, setSendBack] = useState<ControlWorkItem | null>(null);
  const [slotUpload, setSlotUpload] = useState<SlotWorkItem | null>(null);
  const [slotSendBack, setSlotSendBack] = useState<SlotWorkItem | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [sendBackError, setSendBackError] = useState<string | null>(null);

  const mine = tasks.filter((t) => t.assignee?.id === currentUserId);
  const created = tasks.filter((t) => t.createdBy?.id === currentUserId);
  const openCount = (list: TaskRow[]) => list.filter((t) => t.status !== "DONE").length;

  // A control in a running audit is worked slot by slot there, so don't list it twice.
  const auditControlIds = new Set(slotWork.map((s) => s.control.id));
  const myControls = controlWork.filter((c) => c.owner?.id === currentUserId && !auditControlIds.has(c.id));
  const tabs = [
    { key: "mine", label: `My tasks (${openCount(mine) + myControls.length + reviewQueue.length + slotWork.length + slotReviews.length})`, icon: Inbox },
    ...(canManage ? [{ key: "created", label: `Created by me (${openCount(created)})`, icon: Send }] : []),
    ...(canReadAll ? [{ key: "all", label: `All tasks (${openCount(tasks) + controlWork.length})`, icon: ListTodo }] : []),
  ];
  const scoped = tab === "created" ? created : tab === "all" ? tasks : mine;
  const scopedControls = tab === "created" ? [] : tab === "all" ? controlWork : myControls;
  const visibleControls = useMemo(() => {
    // Status and priority filters describe tasks; hide control work while they're in use.
    if (statusFilter || priorityFilter) return [];
    const q = search.trim().toLowerCase();
    return scopedControls.filter((c) =>
      !q || [c.code, c.title, c.owner?.name, ...c.frameworks].some((v) => v?.toLowerCase().includes(q))
    );
  }, [scopedControls, search, statusFilter, priorityFilter]);
  const slotMatches = (i: SlotWorkItem) => {
    const q = search.trim().toLowerCase();
    return !q || [i.control.code, i.control.title, i.periodName, i.slot.label, i.owner?.name].some((v) => v?.toLowerCase().includes(q));
  };
  const showSlots = tab === "mine" && !statusFilter && !priorityFilter;
  const visibleSlotWork = showSlots
    ? slotWork.filter(slotMatches).sort((a, b) => Date.parse(a.slot.end) - Date.parse(b.slot.end))
    : [];
  const visibleSlotReviews = showSlots ? slotReviews.filter(slotMatches) : [];
  const visibleReviews = tab === "mine" && !statusFilter && !priorityFilter
    ? reviewQueue.filter((c) => !search.trim() || [c.code, c.title, c.owner?.name].some((v) => v?.toLowerCase().includes(search.trim().toLowerCase())))
    : [];

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
  // On My tasks, audit evidence counts too.
  const mySlots = tab === "mine" ? slotWork.filter((s) => s.slot.status !== "IN_REVIEW") : [];
  const slotDaysLeft = (s: SlotWorkItem) => (today ? daysBetween(today, s.slot.end.slice(0, 10)) : null);
  const overdue = open.filter((t) => (daysLeft(t) ?? 0) < 0).length + mySlots.filter((s) => s.slot.status === "OVERDUE").length;
  const dueSoon = open.filter((t) => { const d = daysLeft(t); return d !== null && d >= 0 && d <= 7; }).length
    + mySlots.filter((s) => { const d = slotDaysLeft(s); return s.slot.status !== "OVERDUE" && d !== null && d >= 0 && d <= 7; }).length;
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

  async function startControl(c: ControlWorkItem) {
    setBusyControl(c.id);
    const res = await fetch(`/api/controls/${c.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    setBusyControl(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(b?.error ?? "Couldn't update the control");
    toast.success(`Started ${c.code}.`);
    refresh();
  }

  // submit | withdraw | approve | reject
  async function reviewAction(c: ControlWorkItem, action: string, note?: string) {
    setBusyControl(c.id);
    const res = await fetch(`/api/controls/${c.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note !== undefined ? { action, note } : { action }),
    });
    setBusyControl(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(b?.error ?? "Couldn't update the control");
      return false;
    }
    const done: Record<string, string> = {
      submit: b.status === "IMPLEMENTED" ? `${c.code} is implemented and closed.` : `${c.code} submitted for review.`,
      withdraw: `Withdrew ${c.code} from review.`,
      approve: `Approved ${c.code}. It's now implemented.`,
      reject: `Sent ${c.code} back to ${c.owner?.name ?? "the owner"}.`,
    };
    toast.success(done[action]);
    refresh();
    return true;
  }

  async function slotAction(i: SlotWorkItem, action: "submit" | "withdraw" | "approve" | "reject", note?: string) {
    const key = `${i.periodId}:${i.control.id}:${i.slot.index}`;
    setBusyControl(key);
    const res = await fetch(`/api/audit-periods/${i.periodId}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlId: i.control.id, slotIndex: i.slot.index, action, ...(note !== undefined ? { note } : {}) }),
    });
    setBusyControl(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(b?.error ?? "Couldn't update the evidence");
      return false;
    }
    const what = `${i.control.code} · ${i.slot.label}`;
    toast.success({
      submit: b.status === "APPROVED" ? `${what} is complete.` : `${what} submitted for review.`,
      withdraw: `Withdrew ${what} from review.`,
      approve: `Approved ${what}.`,
      reject: `Sent ${what} back to ${i.owner?.name ?? "the owner"}.`,
    }[action]);
    refresh();
    return true;
  }

  async function submitSlotUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!slotUpload) return;
    if (!uploadFile) return setUploadError("Choose a file to upload.");
    setUploading(true);
    setUploadError(null);
    const body = new FormData();
    body.append("controlIds", slotUpload.control.id);
    body.append("auditPeriodId", slotUpload.periodId);
    body.append("slotIndex", String(slotUpload.slot.index));
    body.append("notes", uploadNotes);
    body.append("file", uploadFile);
    const res = await fetch("/api/evidence", { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return setUploadError(b?.error ?? "Upload failed");
    }
    const what = `${slotUpload.control.code} · ${slotUpload.slot.label}`;
    setSlotUpload(null);
    toast.success(`Evidence added to ${what}. ${approvalRequired ? "Submit it for review when you're ready." : "It counts as complete."}`);
    refresh();
  }

  async function submitSlotSendBack(e: React.FormEvent) {
    e.preventDefault();
    if (!slotSendBack) return;
    if (!sendBackNote.trim()) return setSendBackError("Tell the owner what needs to change.");
    if (await slotAction(slotSendBack, "reject", sendBackNote.trim())) setSlotSendBack(null);
  }

  async function submitSendBack(e: React.FormEvent) {
    e.preventDefault();
    if (!sendBack) return;
    if (!sendBackNote.trim()) return setSendBackError("Tell the owner what needs to change.");
    if (await reviewAction(sendBack, "reject", sendBackNote.trim())) setSendBack(null);
  }

  function openUpload(c: ControlWorkItem) {
    setUploadFor(c);
    setUploadFile(null);
    setUploadNotes("");
    setUploadError(null);
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFor) return;
    if (!uploadFile) return setUploadError("Choose a file to upload.");
    setUploading(true);
    setUploadError(null);
    const body = new FormData();
    body.append("controlIds", uploadFor.id);
    body.append("notes", uploadNotes);
    body.append("file", uploadFile);
    const res = await fetch("/api/evidence", { method: "POST", body });
    setUploading(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return setUploadError(b?.error ?? "Upload failed");
    }
    const code = uploadFor.code;
    setUploadFor(null);
    toast.success(`Evidence added to ${code}. ${approvalRequired ? "Submit it for review when you're ready." : "You can now mark it implemented."}`);
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
        <Stat label="Open" value={open.length + scopedControls.length + (tab === "mine" ? reviewQueue.length + slotWork.length + slotReviews.length : 0)} tone="text-gray-900 dark:text-gray-100" />
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

      {visibleSlotReviews.length > 0 && (
        <div className="card mb-4 !p-0 overflow-hidden border-purple-200 dark:border-purple-900">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-purple-600" />
              Audit evidence to review
              <span className="rounded-full bg-purple-100 px-1.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">{visibleSlotReviews.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Evidence for one period of an audit. Approving marks it ready for the auditors.</p>
          </div>
          <ul className="divide-y divide-border">
            {visibleSlotReviews.map((i) => {
              const key = `${i.periodId}:${i.control.id}:${i.slot.index}`;
              return (
                <li key={key} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="mr-1.5 font-mono text-xs text-gray-500">{i.control.code}</span>{i.control.title}
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{i.slot.label}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {i.periodName} · Submitted{i.slot.submittedBy ? ` by ${i.slot.submittedBy}` : ""}{i.slot.submittedAt ? ` on ${formatDate(i.slot.submittedAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => { setSlotSendBack(i); setSendBackNote(""); setSendBackError(null); }} disabled={busyControl === key} className="btn-secondary !px-2.5 !py-1 text-xs">
                        <XCircle className="mr-1 h-3.5 w-3.5" /> Send back
                      </button>
                      <button onClick={() => slotAction(i, "approve")} disabled={busyControl === key} className="btn-primary !px-2.5 !py-1 text-xs">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                      </button>
                    </div>
                  </div>
                  {i.slot.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
                      {i.slot.evidence.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{e.fileName}</span>
                          <span className="shrink-0 text-gray-500">{e.uploadedBy ?? ""} · {formatDate(e.createdAt)}</span>
                          {e.type !== "POLICY" && (
                            <a href={`/api/evidence/${e.id}/download`} className="shrink-0 text-gray-400 hover:text-gray-700" aria-label={`Download ${e.fileName}`}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visibleSlotWork.length > 0 && (
        <div className="card mb-4 !p-0 overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarRange className="h-4 w-4 text-gray-500" />
              Audit evidence due
              <span className="rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{visibleSlotWork.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Upload evidence for each period as it comes round{approvalRequired ? ", then submit it for review" : ""}. Later periods open on their start date.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {visibleSlotWork.map((i) => {
              const key = `${i.periodId}:${i.control.id}:${i.slot.index}`;
              const st = SLOT_TASK_STATUS[i.slot.status] ?? SLOT_TASK_STATUS.DUE;
              const overdue = i.slot.status === "OVERDUE";
              return (
                <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.style}`}>{st.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="mr-1.5 font-mono text-xs text-gray-500">{i.control.code}</span>{i.control.title}
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{i.slot.label}</span>
                    </p>
                    <p className={`mt-0.5 text-xs ${overdue ? "font-medium text-red-600" : "text-gray-500"}`}>
                      {i.periodName} · {overdue ? `Period ended ${formatDate(i.slot.end)}` : `Due ${formatDate(i.slot.end)}`}
                      {i.slot.evidence.length > 0 && <span className="font-normal text-gray-500"> · {i.slot.evidence.length} file{i.slot.evidence.length === 1 ? "" : "s"} uploaded</span>}
                    </p>
                    {i.slot.status === "CHANGES_REQUESTED" && i.slot.note && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <MessageSquareWarning className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span><span className="font-medium">Reviewer:</span> {i.slot.note}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {i.slot.status === "IN_REVIEW" ? (
                      <button onClick={() => slotAction(i, "withdraw")} disabled={busyControl === key} className="btn-secondary !px-2.5 !py-1 text-xs">
                        <Undo2 className="mr-1 h-3.5 w-3.5" /> Withdraw
                      </button>
                    ) : (
                      <>
                        <button onClick={() => { setSlotUpload(i); setUploadFile(null); setUploadNotes(""); setUploadError(null); }} className="btn-secondary !px-2.5 !py-1 text-xs">
                          <Upload className="mr-1 h-3.5 w-3.5" /> Upload evidence
                        </button>
                        {approvalRequired && (
                          <button
                            onClick={() => slotAction(i, "submit")}
                            disabled={i.slot.evidence.length === 0 || busyControl === key}
                            title={i.slot.evidence.length === 0 ? "Upload evidence for this period first" : "Send to a reviewer"}
                            className="btn-primary !px-2.5 !py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <SendIcon className="mr-1 h-3.5 w-3.5" /> {i.slot.status === "CHANGES_REQUESTED" ? "Resubmit" : "Submit for review"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visibleReviews.length > 0 && (
        <div className="card mb-4 !p-0 overflow-hidden border-purple-200 dark:border-purple-900">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-purple-600" />
              Controls to review
              <span className="rounded-full bg-purple-100 px-1.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">{visibleReviews.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Check the evidence. Approving closes the control and marks its evidence as reviewed.</p>
          </div>
          <ul className="divide-y divide-border">
            {visibleReviews.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="mr-1.5 font-mono text-xs text-gray-500">{c.code}</span>{c.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Submitted{c.submittedBy ? ` by ${c.submittedBy.name}` : ""}{c.submittedAt ? ` on ${formatDate(c.submittedAt)}` : ""}
                      {c.owner && c.owner.id !== c.submittedBy?.id && <> · Owner: {c.owner.name}</>}
                      {c.frameworks.length > 0 && <> · {c.frameworks.slice(0, 3).join(", ")}{c.frameworks.length > 3 ? ` +${c.frameworks.length - 3}` : ""}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => { setSendBack(c); setSendBackNote(""); setSendBackError(null); }}
                      disabled={busyControl === c.id}
                      className="btn-secondary !px-2.5 !py-1 text-xs"
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Send back
                    </button>
                    <button
                      onClick={() => reviewAction(c, "approve")}
                      disabled={busyControl === c.id || c.validEvidence === 0}
                      title={c.validEvidence === 0 ? "The evidence has expired; send it back" : "Approve and close"}
                      className="btn-primary !px-2.5 !py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                    </button>
                  </div>
                </div>
                {c.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/50">
                    {c.evidence.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">{e.fileName}</span>
                        <span className={`shrink-0 capitalize ${EVIDENCE_TONE[e.status] ?? "text-gray-500"}`}>
                          {e.status.toLowerCase()}{e.validUntil ? ` · until ${formatDate(e.validUntil)}` : ""}
                        </span>
                        {e.type !== "POLICY" && (
                          <a href={`/api/evidence/${e.id}/download`} className="shrink-0 text-gray-400 hover:text-gray-700" aria-label={`Download ${e.fileName}`}>
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibleControls.length > 0 && (
        <div className="card mb-4 !p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                {tab === "all" ? "Controls waiting on their owners" : "Controls assigned to you"}
                <span className="rounded-full bg-gray-100 px-1.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{visibleControls.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {approvalRequired
                  ? "Upload evidence, then submit the control for review. A reviewer approves it to close it."
                  : "Upload evidence, then mark the control implemented to close it."}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {visibleControls.map((c) => {
              const mineControl = c.owner?.id === currentUserId;
              const reason = CONTROL_REASON[c.reason];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${reason.style}`}>{reason.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span className="mr-1.5 font-mono text-xs text-gray-500">{c.code}</span>{c.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {c.validEvidence > 0
                        ? `${c.validEvidence} valid evidence file${c.validEvidence === 1 ? "" : "s"}${c.nextExpiry ? ` · renews ${formatDate(c.nextExpiry)}` : ""}`
                        : c.totalEvidence > 0 ? "Evidence has expired or was rejected" : "No evidence yet"}
                      {c.frameworks.length > 0 && <> · {c.frameworks.slice(0, 3).join(", ")}{c.frameworks.length > 3 ? ` +${c.frameworks.length - 3}` : ""}</>}
                      {tab === "all" && c.owner && <> · Owner: {mineControl ? "you" : c.owner.name}</>}
                      {c.reason === "IN_REVIEW" && c.submittedAt && <> · Submitted {formatDate(c.submittedAt)}{c.submittedBy && !mineControl ? ` by ${c.submittedBy.name}` : ""}</>}
                    </p>
                    {c.reason === "CHANGES_REQUESTED" && c.reviewNote && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <MessageSquareWarning className="mt-px h-3.5 w-3.5 shrink-0" />
                        <span><span className="font-medium">Reviewer:</span> {c.reviewNote}</span>
                      </p>
                    )}
                  </div>
                  {mineControl && c.reason === "IN_REVIEW" && (
                    <button onClick={() => reviewAction(c, "withdraw")} disabled={busyControl === c.id} className="btn-secondary shrink-0 !px-2.5 !py-1 text-xs">
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Withdraw
                    </button>
                  )}
                  {mineControl && c.reason !== "IN_REVIEW" && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => openUpload(c)} className="btn-secondary !px-2.5 !py-1 text-xs">
                        <Upload className="mr-1 h-3.5 w-3.5" /> Upload evidence
                      </button>
                      {c.reason === "NOT_STARTED" && (
                        <button onClick={() => startControl(c)} disabled={busyControl === c.id} className="btn-secondary !px-2.5 !py-1 text-xs">
                          <PlayCircle className="mr-1 h-3.5 w-3.5" /> Start
                        </button>
                      )}
                      <button
                        onClick={() => reviewAction(c, "submit")}
                        disabled={c.validEvidence === 0 || busyControl === c.id}
                        title={c.validEvidence === 0 ? "Upload valid evidence first" : approvalRequired ? "Send to a reviewer for approval" : "Close this control"}
                        className="btn-primary !px-2.5 !py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approvalRequired
                          ? <><SendIcon className="mr-1 h-3.5 w-3.5" /> {c.reason === "CHANGES_REQUESTED" ? "Resubmit" : "Submit for review"}</>
                          : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark implemented</>}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
                ? tab === "mine"
                  ? visibleControls.length + visibleReviews.length + visibleSlotWork.length + visibleSlotReviews.length > 0
                    ? "No other tasks assigned to you."
                    : "Nothing is assigned to you right now."
                  : "No tasks yet."
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

      <Modal open={!!slotUpload} onClose={() => setSlotUpload(null)} title="Upload audit evidence" size="md">
        {slotUpload && (
          <form onSubmit={submitSlotUpload} className="space-y-4">
            <FormError message={uploadError} />
            <p className="text-sm text-gray-600">
              For <span className="font-mono text-xs">{slotUpload.control.code}</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{slotUpload.control.title}</span>, covering{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{slotUpload.slot.label}</span> of {slotUpload.periodName}.
            </p>
            <Field label="File" htmlFor="slotFile" hint="Max 20 MB. PDF, images, Office files, CSV, text or ZIP.">
              <input id="slotFile" type="file" className="input" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Notes" htmlFor="slotNotes" hint="Optional. What does this file show?">
              <TextArea id="slotNotes" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSlotUpload(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={uploading} className="btn-primary">{uploading ? "Uploading…" : "Upload"}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!slotSendBack} onClose={() => setSlotSendBack(null)} title="Send back for changes" size="md">
        {slotSendBack && (
          <form onSubmit={submitSlotSendBack} className="space-y-4">
            <FormError message={sendBackError} />
            <p className="text-sm text-gray-600">
              <span className="font-mono text-xs">{slotSendBack.control.code}</span> · {slotSendBack.slot.label} goes back to{" "}
              {slotSendBack.owner?.name ?? "its owner"} with your note.
            </p>
            <Field label="What needs to change?" htmlFor="slotSendBackNote">
              <TextArea id="slotSendBackNote" value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} autoFocus />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSlotSendBack(null)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Send back</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!sendBack} onClose={() => setSendBack(null)} title="Send back for changes" size="md">
        {sendBack && (
          <form onSubmit={submitSendBack} className="space-y-4">
            <FormError message={sendBackError} />
            <p className="text-sm text-gray-600">
              <span className="font-mono text-xs">{sendBack.code}</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{sendBack.title}</span> goes back to{" "}
              {sendBack.owner?.name ?? "its owner"} with your note.
            </p>
            <Field label="What needs to change?" htmlFor="sendBackNote">
              <TextArea
                id="sendBackNote"
                value={sendBackNote}
                onChange={(e) => setSendBackNote(e.target.value)}
                placeholder="e.g. The screenshot doesn't show MFA enforced for the admin group; export the policy settings instead."
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSendBack(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={busyControl === sendBack.id} className="btn-primary">Send back</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!uploadFor} onClose={() => setUploadFor(null)} title="Upload evidence" size="md">
        {uploadFor && (
          <form onSubmit={submitUpload} className="space-y-4">
            <FormError message={uploadError} />
            <p className="text-sm text-gray-600">
              For <span className="font-mono text-xs">{uploadFor.code}</span>{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">{uploadFor.title}</span>
              {uploadFor.frameworks.length > 0 && <>. Counts towards {uploadFor.frameworks.join(", ")}.</>}
            </p>
            <Field label="File" htmlFor="ctlFile" hint="Max 20 MB. PDF, images, Office files, CSV, text or ZIP.">
              <input id="ctlFile" type="file" className="input" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Notes" htmlFor="ctlNotes" hint="Optional. What does this file show?">
              <TextArea id="ctlNotes" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUploadFor(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={uploading} className="btn-primary">{uploading ? "Uploading…" : "Upload"}</button>
            </div>
          </form>
        )}
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
