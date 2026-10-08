"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Plus, CheckCircle, XCircle, History } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type ControlRef = { id: string; code: string; title: string };
type UserRef = { id: string; name: string };
type ExceptionRow = {
  id: string;
  reason: string;
  compensatingControl: string;
  validFrom: string;
  validUntil: string;
  status: string;
  notes: string;
  createdAt: string;
  control: ControlRef;
  requestedBy: UserRef | null;
  approvedBy: UserRef | null;
};

const STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "EXPIRED", "CLOSED"] as const;

function statusColor(s: string) {
  const colors: Record<string, string> = {
    REQUESTED: "bg-amber-100 text-amber-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-600",
    CLOSED: "bg-gray-100 text-gray-600",
  };
  return colors[s] ?? "bg-gray-100 text-gray-600";
}

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

export function ExceptionsClient({
  initialExceptions,
  users,
  controls,
  canRequest,
  canApprove,
}: {
  initialExceptions: ExceptionRow[];
  users: UserRef[];
  controls: ControlRef[];
  canRequest: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("content");
  const [showModal, setShowModal] = useState(false);
  const [editException, setEditException] = useState<ExceptionRow | null>(null);

  // Form state
  const [controlId, setControlId] = useState("");
  const [reason, setReason] = useState("");
  const [compensatingControl, setCompensatingControl] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = initialExceptions.filter((ex) => {
    if (statusFilter && ex.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !ex.reason.toLowerCase().includes(q) &&
        !ex.control.code.toLowerCase().includes(q) &&
        !ex.control.title.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function openCreate() {
    setEditException(null);
    setControlId("");
    setReason("");
    setCompensatingControl("");
    setValidFrom("");
    setValidUntil("");
    setNotes("");
    setError(null);
    setShowModal(true);
  }

  function openEdit(ex: ExceptionRow) {
    setEditException(ex);
    setControlId(ex.control.id);
    setReason(ex.reason);
    setCompensatingControl(ex.compensatingControl);
    setValidFrom(ex.validFrom.slice(0, 10));
    setValidUntil(ex.validUntil.slice(0, 10));
    setNotes(ex.notes);
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      controlId,
      reason,
      compensatingControl,
      validFrom: new Date(validFrom).toISOString(),
      validUntil: new Date(validUntil).toISOString(),
      notes,
    };

    const url = editException ? `/api/exceptions/${editException.id}` : "/api/exceptions";
    const method = editException ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Failed to save exception");
      return;
    }

    setShowModal(false);
    toast.success(editException ? "Exception updated." : "Exception requested.");
    startTransition(() => router.refresh());
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/exceptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Failed to update status");
      return;
    }
    toast.success(`Exception ${status.toLowerCase()}.`);
    startTransition(() => router.refresh());
  }

  const activeCount = initialExceptions.filter((ex) => ex.status === "APPROVED").length;
  const pendingCount = initialExceptions.filter((ex) => ex.status === "REQUESTED").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Control Exceptions</h1>
          <p className="mt-1 text-sm text-gray-500">
            {activeCount} active exception{activeCount !== 1 ? "s" : ""}
            {pendingCount > 0 && (
              <span className="text-amber-600 font-medium ml-2">
                · {pendingCount} pending approval
              </span>
            )}
          </p>
        </div>
        {canRequest && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Request exception
          </button>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Exceptions", icon: ShieldAlert },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["ControlException"]} title="Exceptions Audit Log" />
      )}

      {activeTab === "content" && (<>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search exceptions…"
        selects={[
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
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Control</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Reason</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Status</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Valid period</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Requested by</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((ex) => {
                const isExpired = new Date(ex.validUntil) < new Date() && ex.status === "APPROVED";
                return (
                  <tr
                    key={ex.id}
                    className="transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => openEdit(ex)}
                  >
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm font-mono text-gray-700">{ex.control.code}</p>
                      <p className="text-xs text-gray-500">{ex.control.title}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                      {ex.reason}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(isExpired ? "EXPIRED" : ex.status)}`}>
                        {humanLabel(isExpired ? "expired" : ex.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(ex.validFrom).toISOString().slice(0, 10)} — {new Date(ex.validUntil).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {ex.requestedBy?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      {canApprove && ex.status === "REQUESTED" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateStatus(ex.id, "APPROVED")}
                            className="rounded p-1 text-green-600 hover:bg-green-50"
                            title="Approve"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(ex.id, "REJECTED")}
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
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
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No exceptions match the current filters.</p>
          </div>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editException ? "Edit exception" : "Request exception"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          <Field label="Control" htmlFor="exControl">
            <Select
              id="exControl"
              value={controlId}
              onChange={(e) => setControlId(e.target.value)}
              disabled={!!editException}
            >
              <option value="">Select a control…</option>
              {controls.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="exReason" hint="Why is this exception required?">
            <TextArea
              id="exReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </Field>
          <Field label="Compensating control" htmlFor="exComp" hint="How is risk reduced while this exception exists?">
            <TextArea
              id="exComp"
              value={compensatingControl}
              onChange={(e) => setCompensatingControl(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valid from" htmlFor="exFrom">
              <input
                id="exFrom"
                type="date"
                className="input"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </Field>
            <Field label="Valid until" htmlFor="exUntil">
              <input
                id="exUntil"
                type="date"
                className="input"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="exNotes">
            <TextArea
              id="exNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !controlId} className="btn-primary">
              {submitting ? "Saving…" : editException ? "Update" : "Submit request"}
            </button>
          </div>
        </form>
      </Modal>

      </>)}
    </div>
  );
}
