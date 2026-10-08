"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Plus, AlertTriangle, History } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type ControlRef = { id: string; code: string; title: string };
type UserRef = { id: string; name: string };
type FindingRow = {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  dueDate: string | null;
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
  control: ControlRef | null;
  risk: { id: string; title: string } | null;
  owner: UserRef | null;
};

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED", "CLOSED"] as const;

function severityColor(s: string) {
  const colors: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800",
    HIGH: "bg-orange-100 text-orange-800",
    MEDIUM: "bg-amber-100 text-amber-800",
    LOW: "bg-blue-100 text-blue-800",
  };
  return colors[s] ?? "bg-gray-100 text-gray-800";
}

function statusColor(s: string) {
  const colors: Record<string, string> = {
    OPEN: "bg-red-50 text-red-700",
    IN_PROGRESS: "bg-blue-50 text-blue-700",
    RESOLVED: "bg-green-50 text-green-700",
    ACCEPTED: "bg-purple-50 text-purple-700",
    CLOSED: "bg-gray-100 text-gray-600",
  };
  return colors[s] ?? "bg-gray-100 text-gray-600";
}

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

export function FindingsClient({
  initialFindings,
  users,
  controls,
  canWrite,
  canClose,
}: {
  initialFindings: FindingRow[];
  users: UserRef[];
  controls: ControlRef[];
  canWrite: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("content");
  const [showModal, setShowModal] = useState(false);
  const [editFinding, setEditFinding] = useState<FindingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FindingRow | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("MEDIUM");
  const [status, setStatus] = useState<string>("OPEN");
  const [controlId, setControlId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = initialFindings.filter((f) => {
    if (severityFilter && f.severity !== severityFilter) return false;
    if (statusFilter && f.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !f.title.toLowerCase().includes(q) &&
        !f.description.toLowerCase().includes(q) &&
        !(f.control?.code.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  function openCreate() {
    setEditFinding(null);
    setTitle("");
    setDescription("");
    setSeverity("MEDIUM");
    setStatus("OPEN");
    setControlId("");
    setOwnerId("");
    setDueDate("");
    setResolution("");
    setError(null);
    setShowModal(true);
  }

  function openEdit(f: FindingRow) {
    setEditFinding(f);
    setTitle(f.title);
    setDescription(f.description);
    setSeverity(f.severity);
    setStatus(f.status);
    setControlId(f.control?.id ?? "");
    setOwnerId(f.owner?.id ?? "");
    setDueDate(f.dueDate ? f.dueDate.slice(0, 10) : "");
    setResolution(f.resolution);
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      title,
      description,
      severity,
      controlId: controlId || null,
      ownerId: ownerId || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };

    if (editFinding) {
      body.status = status;
      body.resolution = resolution;
    }

    const url = editFinding ? `/api/findings/${editFinding.id}` : "/api/findings";
    const method = editFinding ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Failed to save finding");
      return;
    }

    setShowModal(false);
    toast.success(editFinding ? "Finding updated." : "Finding created.");
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/findings/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete finding");
      return;
    }
    setDeleteTarget(null);
    toast.success("Finding deleted.");
    startTransition(() => router.refresh());
  }

  const openCount = initialFindings.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;
  const criticalCount = initialFindings.filter((f) => f.severity === "CRITICAL" && f.status !== "CLOSED" && f.status !== "RESOLVED").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Findings</h1>
          <p className="mt-1 text-sm text-gray-500">
            {openCount} open finding{openCount !== 1 ? "s" : ""}
            {criticalCount > 0 && (
              <span className="text-red-600 font-medium ml-2">
                · {criticalCount} critical
              </span>
            )}
          </p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            New finding
          </button>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Findings", icon: FileSearch },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Finding"]} title="Findings Audit Log" />
      )}

      {activeTab === "content" && (<>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search findings…"
        selects={[
          {
            label: "Severity",
            value: severityFilter,
            onChange: setSeverityFilter,
            options: SEVERITIES.map((s) => ({ value: s, label: humanLabel(s) })),
          },
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: STATUSES.map((s) => ({ value: s, label: humanLabel(s) })),
          },
        ]}
      />

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Title</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Control</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Severity</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Status</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Owner</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Due</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((f) => {
                const overdue = f.dueDate && new Date(f.dueDate) < new Date() && f.status !== "CLOSED" && f.status !== "RESOLVED";
                return (
                  <tr
                    key={f.id}
                    className="transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => canWrite ? openEdit(f) : undefined}
                  >
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm font-medium text-gray-900">{f.title}</p>
                      {f.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{f.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {f.control?.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityColor(f.severity)}`}>
                        {humanLabel(f.severity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(f.status)}`}>
                        {humanLabel(f.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {f.owner?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {f.dueDate ? (
                        <span className={overdue ? "text-red-600 font-medium" : "text-gray-600"}>
                          {overdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                          {new Date(f.dueDate).toISOString().slice(0, 10)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(f.createdAt).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <FileSearch className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No findings match the current filters.</p>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editFinding ? "Edit finding" : "New finding"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          <Field label="Title" htmlFor="findingTitle">
            <input
              id="findingTitle"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>
          <Field label="Description" htmlFor="findingDesc">
            <TextArea
              id="findingDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Severity" htmlFor="findingSeverity">
              <Select id="findingSeverity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{humanLabel(s)}</option>
                ))}
              </Select>
            </Field>
            {editFinding && (
              <Field label="Status" htmlFor="findingStatus">
                <Select
                  id="findingStatus"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={!canClose && (status === "RESOLVED" || status === "ACCEPTED" || status === "CLOSED")}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{humanLabel(s)}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Control" htmlFor="findingControl">
              <Select id="findingControl" value={controlId} onChange={(e) => setControlId(e.target.value)}>
                <option value="">None</option>
                {controls.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="findingOwner">
              <Select id="findingOwner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Due date" htmlFor="findingDue">
            <input
              id="findingDue"
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          {editFinding && (
            <Field label="Resolution" htmlFor="findingResolution" hint="Describe how this finding was addressed.">
              <TextArea
                id="findingResolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </Field>
          )}
          <div className="flex justify-between pt-2">
            <div>
              {editFinding && canWrite && (
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setDeleteTarget(editFinding); }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Saving…" : editFinding ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete finding"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />

      </>)}
    </div>
  );
}
