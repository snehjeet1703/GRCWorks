"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Plus, Pencil, Trash2, Check, Eye, History } from "lucide-react";
import { getPolicyStatusColor } from "@/lib/utils";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, TextInput, TextArea, Select, FormError } from "@/components/form";
import { ControlPicker, PickerControl } from "@/components/control-picker";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type Approver = { id: string; name: string };
type PolicyRow = {
  id: string;
  title: string;
  content: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "EXPIRED" | "ARCHIVED";
  version: number;
  approver: Approver | null;
  approvedAt: string | null;
  expiresAt: string | null;
  linkedControlIds: string[];
  linkedControlCodes: string[];
};

type FormState = {
  title: string;
  content: string;
  status: PolicyRow["status"];
  expiresAt: string;
  controlIds: string[];
};

const EMPTY: FormState = { title: "", content: "", status: "DRAFT", expiresAt: "", controlIds: [] };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function PoliciesClient({
  initialPolicies,
  allControls,
  canEdit,
}: {
  initialPolicies: PolicyRow[];
  allControls: PickerControl[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const [activeTab, setActiveTab] = useState("content");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyRow | null>(null);
  const [viewing, setViewing] = useState<PolicyRow | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(p: PolicyRow) {
    setEditing(p);
    setForm({
      title: p.title,
      content: p.content ?? "",
      status: p.status,
      expiresAt: toDateInput(p.expiresAt),
      controlIds: [...p.linkedControlIds],
    });
    setError(null);
    setModalOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      content: form.content,
      status: form.status,
      expiresAt: form.expiresAt
        ? new Date(form.expiresAt + "T00:00:00.000Z").toISOString()
        : null,
      controlIds: form.controlIds,
    };
    const url = editing ? `/api/policies/${editing.id}` : "/api/policies";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Save failed");
      return;
    }
    setModalOpen(false);
    toast.success(editing ? "Policy updated." : "Policy created.");
    startTransition(() => router.refresh());
  }

  async function approve(p: PolicyRow) {
    const res = await fetch(`/api/policies/${p.id}/approve`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Approve failed");
      return;
    }
    toast.success(`Approved "${p.title}".`);
    startTransition(() => router.refresh());
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/policies/${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Delete failed");
      return;
    }
    toast.success(`Deleted "${target.title}".`);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage organizational policies and their lifecycle.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New policy
          </button>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Policies", icon: ScrollText },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Policy"]} title="Policy Audit Log" />
      )}

      {activeTab === "content" && (<>
      <div className="grid gap-4">
        {initialPolicies.map((policy) => (
          <div key={policy.id} className="card">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewing(policy)}
                className="flex items-center gap-4 min-w-0 text-left flex-1 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label={`View ${policy.title}`}
              >
                <div className="rounded-lg bg-emerald-50 p-2.5 shrink-0">
                  <ScrollText className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">{policy.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Version {policy.version}
                    {policy.approver && ` · Approved by ${policy.approver.name}`}
                    {" · "}
                    {policy.linkedControlIds.length} linked controls
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge ${getPolicyStatusColor(policy.status)}`}>
                  {policy.status.toLowerCase().replace("_", " ")}
                </span>
                <button
                  onClick={() => setViewing(policy)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="View policy"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                {canEdit && (
                  <>
                    {policy.status !== "APPROVED" && policy.status !== "ARCHIVED" && (
                      <button
                        onClick={() => approve(policy)}
                        className="rounded p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                        aria-label="Approve policy"
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(policy)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Edit policy"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(policy)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete policy"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {initialPolicies.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
            <ScrollText className="h-8 w-8 mb-2" />
            <p className="text-sm">No policies created yet.</p>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit policy" : "New policy"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="Title" htmlFor="title">
            <TextInput
              id="title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as PolicyRow["status"] })}
              >
                <option value="DRAFT">Draft</option>
                <option value="IN_REVIEW">In review</option>
                <option value="APPROVED">Approved</option>
                <option value="EXPIRED">Expired</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
            <Field label="Expires on" htmlFor="expiresAt" hint="Optional. Used to flag policies needing renewal.">
              <TextInput
                id="expiresAt"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Content" htmlFor="content" hint="Editing an APPROVED policy's content will bump the version and reset to DRAFT.">
            <TextArea
              id="content"
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </Field>
          <Field
            label="Linked controls"
            hint="Controls this policy addresses. Auditors see the policy attached to every linked control."
          >
            <ControlPicker
              allControls={allControls}
              selectedIds={form.controlIds}
              onChange={(ids) => setForm({ ...form, controlIds: ids })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Saving…" : editing ? "Save changes" : "Create policy"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete policy"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ""}
        size="lg"
      >
        {viewing && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className={`badge ${getPolicyStatusColor(viewing.status)}`}>
                {viewing.status.toLowerCase().replace("_", " ")}
              </span>
              <span>Version {viewing.version}</span>
              {viewing.approver && (
                <span>
                  Approved by <span className="text-gray-700">{viewing.approver.name}</span>
                  {viewing.approvedAt && ` on ${new Date(viewing.approvedAt).toLocaleDateString()}`}
                </span>
              )}
              {viewing.expiresAt && (
                <span>Expires {new Date(viewing.expiresAt).toLocaleDateString()}</span>
              )}
            </div>
            {viewing.linkedControlCodes.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1">
                <span className="text-xs font-medium text-gray-500 mr-1">Controls:</span>
                {viewing.linkedControlCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-4">
              {viewing.content ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800">
                  {viewing.content}
                </pre>
              ) : (
                <p className="text-sm italic text-gray-400">This policy has no content yet.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      </>)}
    </div>
  );
}
