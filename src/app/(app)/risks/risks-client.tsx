"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Pencil, Trash2, ChevronDown, ChevronRight, CheckCircle, History } from "lucide-react";
import { getRiskScore, getRiskLevel, getRiskColor } from "@/lib/utils";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, TextInput, TextArea, Select, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { ControlPicker, PickerControl } from "@/components/control-picker";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type Owner = { id: string; name: string };
type RiskActionRow = {
  id: string;
  action: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  notes: string;
  owner: Owner | null;
};
type RiskRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  likelihood: number;
  impact: number;
  inherentScore: number;
  residualScore: number;
  status: string;
  treatment: "ACCEPT" | "MITIGATE" | "TRANSFER" | "AVOID";
  treatmentPlan: string;
  ownerId: string | null;
  owner: Owner | null;
  linkedControlIds: string[];
  linkedControlCodes: string[];
  actions: RiskActionRow[];
};

type FormState = {
  title: string;
  description: string;
  category: string;
  likelihood: string;
  impact: string;
  treatment: RiskRow["treatment"];
  treatmentPlan: string;
  status: string;
  ownerId: string;
  controlIds: string[];
};

const EMPTY: FormState = {
  title: "",
  description: "",
  category: "",
  likelihood: "3",
  impact: "3",
  treatment: "MITIGATE",
  treatmentPlan: "",
  status: "OPEN",
  ownerId: "",
  controlIds: [],
};

const RISK_STATUSES = ["OPEN", "IN_TREATMENT", "ACCEPTED", "CLOSED"] as const;
const ACTION_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

function riskStatusColor(s: string) {
  const c: Record<string, string> = {
    OPEN: "bg-red-50 text-red-700",
    IN_TREATMENT: "bg-blue-50 text-blue-700",
    ACCEPTED: "bg-amber-50 text-amber-700",
    CLOSED: "bg-gray-100 text-gray-600",
  };
  return c[s] ?? "bg-gray-100 text-gray-600";
}

function actionStatusColor(s: string) {
  const c: Record<string, string> = {
    PENDING: "bg-gray-100 text-gray-600",
    IN_PROGRESS: "bg-blue-50 text-blue-700",
    COMPLETED: "bg-green-50 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };
  return c[s] ?? "bg-gray-100 text-gray-600";
}

function scoreColor(score: number) {
  if (score >= 15) return "text-red-600";
  if (score >= 8) return "text-amber-600";
  return "text-green-600";
}

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

export function RisksClient({
  initialRisks,
  users,
  allControls,
  canEdit,
}: {
  initialRisks: RiskRow[];
  users: Owner[];
  allControls: PickerControl[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<RiskRow | null>(null);
  const [activeTab, setActiveTab] = useState("content");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RiskRow | null>(null);
  const [search, setSearch] = useState("");
  const [treatmentFilter, setTreatmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);

  // Action modal state
  const [actionModal, setActionModal] = useState<{ riskId: string; editing?: RiskActionRow } | null>(null);
  const [actionForm, setActionForm] = useState({ action: "", ownerId: "", dueDate: "", status: "PENDING", notes: "" });
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredRisks = initialRisks.filter((r) => {
    if (treatmentFilter && r.treatment !== treatmentFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (ownerFilter === "unassigned" && r.ownerId) return false;
    if (ownerFilter && ownerFilter !== "unassigned" && r.ownerId !== ownerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.title.toLowerCase().includes(q) &&
        !r.category.toLowerCase().includes(q) &&
        !r.description.toLowerCase().includes(q) &&
        !r.linkedControlCodes.some((c) => c.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(risk: RiskRow) {
    setEditing(risk);
    setForm({
      title: risk.title,
      description: risk.description ?? "",
      category: risk.category ?? "",
      likelihood: String(risk.likelihood),
      impact: String(risk.impact),
      treatment: risk.treatment,
      treatmentPlan: risk.treatmentPlan ?? "",
      status: risk.status,
      ownerId: risk.ownerId ?? "",
      controlIds: [...risk.linkedControlIds],
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
      description: form.description,
      category: form.category,
      likelihood: Number(form.likelihood),
      impact: Number(form.impact),
      treatment: form.treatment,
      treatmentPlan: form.treatmentPlan,
      status: form.status,
      ownerId: form.ownerId || null,
      controlIds: form.controlIds,
    };

    const url = editing ? `/api/risks/${editing.id}` : "/api/risks";
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
    toast.success(editing ? "Risk updated." : "Risk created.");
    startTransition(() => router.refresh());
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/risks/${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Delete failed");
      return;
    }
    toast.success(`Deleted "${target.title}".`);
    startTransition(() => router.refresh());
  }

  function openActionCreate(riskId: string) {
    setActionModal({ riskId });
    setActionForm({ action: "", ownerId: "", dueDate: "", status: "PENDING", notes: "" });
    setActionError(null);
  }

  function openActionEdit(riskId: string, a: RiskActionRow) {
    setActionModal({ riskId, editing: a });
    setActionForm({
      action: a.action,
      ownerId: a.owner?.id ?? "",
      dueDate: a.dueDate?.slice(0, 10) ?? "",
      status: a.status,
      notes: a.notes,
    });
    setActionError(null);
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!actionModal) return;
    setActionSubmitting(true);
    setActionError(null);

    const body: Record<string, unknown> = {
      action: actionForm.action,
      ownerId: actionForm.ownerId || null,
      dueDate: actionForm.dueDate ? new Date(actionForm.dueDate).toISOString() : null,
      status: actionForm.status,
      notes: actionForm.notes,
    };
    if (actionModal.editing) body.actionId = actionModal.editing.id;

    const res = await fetch(`/api/risks/${actionModal.riskId}/actions`, {
      method: actionModal.editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setActionSubmitting(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setActionError(b?.error ?? "Failed to save action");
      return;
    }
    setActionModal(null);
    toast.success(actionModal.editing ? "Action updated." : "Action added.");
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Risk register</h1>
          <p className="mt-1 text-sm text-gray-500">
            Identify, assess, and manage organizational risks.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add risk
          </button>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Risks", icon: AlertTriangle },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Risk", "RiskAction"]} title="Risk Audit Log" />
      )}

      {activeTab === "content" && (<>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search risks by title, category, description, or control code…"
        selects={[
          {
            label: "Treatment",
            value: treatmentFilter,
            onChange: setTreatmentFilter,
            options: [
              { value: "MITIGATE", label: "Mitigate" },
              { value: "ACCEPT", label: "Accept" },
              { value: "TRANSFER", label: "Transfer" },
              { value: "AVOID", label: "Avoid" },
            ],
          },
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: RISK_STATUSES.map((s) => ({ value: s, label: humanLabel(s) })),
          },
          {
            label: "Owner",
            value: ownerFilter,
            onChange: setOwnerFilter,
            options: [
              { value: "unassigned", label: "Unassigned" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ],
          },
        ]}
      />

      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 w-6" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Controls</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Inherent</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Residual</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Treatment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRisks.map((risk) => {
                const score = getRiskScore(risk.likelihood, risk.impact);
                const level = getRiskLevel(score);
                const isExpanded = expandedRisk === risk.id;
                const pendingActions = risk.actions.filter((a) => a.status === "PENDING" || a.status === "IN_PROGRESS").length;
                return (
                  <>
                    <tr key={risk.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedRisk(isExpanded ? null : risk.id)}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{risk.title}</p>
                        <p className="text-xs text-gray-500">
                          {risk.category || "—"} · L {risk.likelihood}/5 · I {risk.impact}/5
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {risk.linkedControlCodes.length === 0 ? (
                          <span className="text-xs text-gray-400">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {risk.linkedControlCodes.slice(0, 4).map((code) => (
                              <span
                                key={code}
                                className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700"
                              >
                                {code}
                              </span>
                            ))}
                            {risk.linkedControlCodes.length > 4 && (
                              <span className="text-xs text-gray-400">
                                +{risk.linkedControlCodes.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div>
                          <span className={`text-lg font-semibold ${scoreColor(risk.inherentScore || score)}`}>
                            {risk.inherentScore || score}
                          </span>
                          <p className="text-[10px] text-gray-400">inherent</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div>
                          <span className={`text-lg font-semibold ${scoreColor(risk.residualScore)}`}>
                            {risk.residualScore || "—"}
                          </span>
                          <p className="text-[10px] text-gray-400">residual</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${riskStatusColor(risk.status)}`}>
                          {humanLabel(risk.status)}
                        </span>
                        {pendingActions > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{pendingActions} action{pendingActions !== 1 ? "s" : ""} pending</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">
                        {risk.treatment.toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{risk.owner?.name || "—"}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(risk)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Edit risk"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(risk)}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete risk"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr key={`${risk.id}-actions`}>
                        <td colSpan={canEdit ? 9 : 8} className="bg-gray-50 px-8 py-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-medium text-gray-700">Treatment actions</h3>
                            {canEdit && (
                              <button onClick={() => openActionCreate(risk.id)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                                + Add action
                              </button>
                            )}
                          </div>
                          {risk.actions.length === 0 ? (
                            <p className="text-xs text-gray-400">No treatment actions defined.</p>
                          ) : (
                            <div className="space-y-2">
                              {risk.actions.map((a) => {
                                const overdue = a.dueDate && new Date(a.dueDate) < new Date() && a.status !== "COMPLETED" && a.status !== "CANCELLED";
                                return (
                                  <div
                                    key={a.id}
                                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 cursor-pointer hover:border-gray-300"
                                    onClick={() => canEdit && openActionEdit(risk.id, a)}
                                  >
                                    {a.status === "COMPLETED" ? (
                                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                    ) : (
                                      <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
                                    )}
                                    <span className="text-sm text-gray-800 flex-1">{a.action}</span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${actionStatusColor(a.status)}`}>
                                      {humanLabel(a.status)}
                                    </span>
                                    {a.owner && <span className="text-xs text-gray-500">{a.owner.name}</span>}
                                    {a.dueDate && (
                                      <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                                        {overdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                                        {new Date(a.dueDate).toISOString().slice(0, 10)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRisks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm">
              {initialRisks.length === 0
                ? "No risks registered yet."
                : "No risks match the current filters."}
            </p>
          </div>
        )}
      </div>

      {/* Risk create/edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit risk" : "New risk"}
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
            <Field label="Category" htmlFor="category">
              <TextInput
                id="category"
                value={form.category}
                placeholder="e.g. Security, Vendor"
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Owner" htmlFor="ownerId">
              <Select
                id="ownerId"
                value={form.ownerId}
                onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Likelihood (1-5)" htmlFor="likelihood">
              <Select
                id="likelihood"
                value={form.likelihood}
                onChange={(e) => setForm({ ...form, likelihood: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Impact (1-5)" htmlFor="impact">
              <Select
                id="impact"
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Treatment" htmlFor="treatment">
              <Select
                id="treatment"
                value={form.treatment}
                onChange={(e) => setForm({ ...form, treatment: e.target.value as FormState["treatment"] })}
              >
                <option value="MITIGATE">Mitigate</option>
                <option value="ACCEPT">Accept</option>
                <option value="TRANSFER">Transfer</option>
                <option value="AVOID">Avoid</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="riskStatus">
              <Select
                id="riskStatus"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {RISK_STATUSES.map((s) => (
                  <option key={s} value={s}>{humanLabel(s)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="description">
            <TextArea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Treatment plan" htmlFor="treatmentPlan">
            <TextArea
              id="treatmentPlan"
              value={form.treatmentPlan}
              onChange={(e) => setForm({ ...form, treatmentPlan: e.target.value })}
            />
          </Field>
          <Field
            label="Linked controls"
            hint="Controls that mitigate this risk. Coverage from these controls will roll up under this risk."
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
              {submitting ? "Saving…" : editing ? "Save changes" : "Create risk"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Action modal */}
      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={actionModal?.editing ? "Edit action" : "Add treatment action"}
        size="md"
      >
        <form onSubmit={submitAction} className="space-y-4">
          <FormError message={actionError} />
          <Field label="Action" htmlFor="actionText" hint="What needs to be done?">
            <TextArea
              id="actionText"
              value={actionForm.action}
              onChange={(e) => setActionForm({ ...actionForm, action: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner" htmlFor="actionOwner">
              <Select
                id="actionOwner"
                value={actionForm.ownerId}
                onChange={(e) => setActionForm({ ...actionForm, ownerId: e.target.value })}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="actionDue">
              <input
                id="actionDue"
                type="date"
                className="input"
                value={actionForm.dueDate}
                onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })}
              />
            </Field>
          </div>
          {actionModal?.editing && (
            <Field label="Status" htmlFor="actionStatus">
              <Select
                id="actionStatus"
                value={actionForm.status}
                onChange={(e) => setActionForm({ ...actionForm, status: e.target.value })}
              >
                {ACTION_STATUSES.map((s) => (
                  <option key={s} value={s}>{humanLabel(s)}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Notes" htmlFor="actionNotes">
            <TextArea
              id="actionNotes"
              value={actionForm.notes}
              onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setActionModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={actionSubmitting} className="btn-primary">
              {actionSubmitting ? "Saving…" : actionModal?.editing ? "Update" : "Add action"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete risk"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />

      </>)}
    </div>
  );
}
