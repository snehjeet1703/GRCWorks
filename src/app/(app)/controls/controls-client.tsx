"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  History,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, Select, TextArea, TextInput, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";
import { ConfirmDialog } from "@/components/modal";
import { getControlStatusColor } from "@/lib/utils";

type UserRef = { id: string; name: string };
type ControlRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: string;
  frequency: string;
  applicability: string;
  applicabilityJustification: string;
  implementationNotes: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
  deps: {
    evidence: number;
    risks: number;
    policies: number;
    tests: number;
    mappings: number;
    findings: number;
    exceptions: number;
  };
};

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "NOT_APPLICABLE"] as const;
const FREQUENCIES = [
  "CONTINUOUS",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
  "AS_NEEDED",
] as const;
const APPLICABILITIES = [
  "APPLICABLE",
  "NOT_APPLICABLE",
  "PARTIALLY_APPLICABLE",
  "INHERITED",
] as const;

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

function depTotal(d: ControlRow["deps"]) {
  return d.evidence + d.risks + d.policies + d.tests + d.mappings + d.findings + d.exceptions;
}

export function ControlsClient({
  initialControls,
  users,
  canEdit,
}: {
  initialControls: ControlRow[];
  users: UserRef[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("content");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editControl, setEditControl] = useState<ControlRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ControlRow | null>(null);

  // Form fields
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("NOT_STARTED");
  const [frequency, setFrequency] = useState<string>("AS_NEEDED");
  const [applicability, setApplicability] = useState<string>("APPLICABLE");
  const [justification, setJustification] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [implNotes, setImplNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = initialControls.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.code.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  function openCreate() {
    setEditControl(null);
    setCode("");
    setTitle("");
    setDescription("");
    setStatus("NOT_STARTED");
    setFrequency("AS_NEEDED");
    setApplicability("APPLICABLE");
    setJustification("");
    setOwnerId("");
    setImplNotes("");
    setError(null);
    setShowModal(true);
  }

  function openEdit(c: ControlRow) {
    setEditControl(c);
    setCode(c.code);
    setTitle(c.title);
    setDescription(c.description);
    setStatus(c.status);
    setFrequency(c.frequency);
    setApplicability(c.applicability);
    setJustification(c.applicabilityJustification);
    setOwnerId(c.ownerId ?? "");
    setImplNotes(c.implementationNotes);
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      code,
      title,
      description,
      status,
      frequency,
      applicability,
      applicabilityJustification: justification,
      ownerId: ownerId || null,
      implementationNotes: implNotes,
    };

    const url = editControl
      ? `/api/controls/${editControl.id}`
      : "/api/controls";
    const method = editControl ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      const msg =
        b?.error ??
        b?.details?.fieldErrors?.applicabilityJustification?.[0] ??
        b?.details?.fieldErrors?.title?.[0] ??
        b?.details?.fieldErrors?.code?.[0] ??
        "Failed to save control";
      setError(msg);
      return;
    }

    setShowModal(false);
    toast.success(
      editControl ? "Control updated." : "Control created."
    );
    startTransition(() => router.refresh());
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/controls/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Failed to delete control");
      setDeleteTarget(null);
      return;
    }
    toast.success("Control deleted.");
    setDeleteTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Controls</h1>
          <p className="mt-1 text-sm text-gray-500">
            {initialControls.length} control{initialControls.length !== 1 ? "s" : ""} total
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Add control
          </button>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Controls", icon: Shield },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Control", "ControlTest"]} title="Controls Audit Log" />
      )}

      {activeTab === "content" && (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search controls by code, title, or description…"
            selects={[
              {
                label: "Status",
                value: statusFilter,
                onChange: setStatusFilter,
                options: STATUSES.map((s) => ({
                  value: s,
                  label: humanLabel(s),
                })),
              },
            ]}
          />

          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Owner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Frequency
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Applicability
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Deps
                    </th>
                    {canEdit && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => canEdit ? openEdit(c) : undefined}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                        {c.code}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{c.title}</p>
                        {c.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {c.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {c.ownerName || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${getControlStatusColor(c.status)}`}
                        >
                          {humanLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                        {humanLabel(c.frequency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                        {humanLabel(c.applicability)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {depTotal(c.deps)}
                      </td>
                      {canEdit && (
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEdit(c)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(c)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="py-12 text-center">
                <Shield className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-400">
                  No controls match the current filters.
                </p>
              </div>
            )}
          </div>

          {/* Create / Edit modal */}
          <Modal
            open={showModal}
            onClose={() => setShowModal(false)}
            title={editControl ? `Edit ${editControl.code}` : "Add control"}
            size="lg"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormError message={error} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Code" htmlFor="ctrlCode" hint="Unique identifier (e.g. CTRL-001)">
                  <TextInput
                    id="ctrlCode"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={50}
                    disabled={!!editControl}
                  />
                </Field>
                <Field label="Title" htmlFor="ctrlTitle">
                  <TextInput
                    id="ctrlTitle"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={300}
                  />
                </Field>
              </div>

              <Field label="Description" htmlFor="ctrlDesc">
                <TextArea
                  id="ctrlDesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Owner" htmlFor="ctrlOwner">
                  <Select
                    id="ctrlOwner"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status" htmlFor="ctrlStatus">
                  <Select
                    id="ctrlStatus"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanLabel(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Frequency" htmlFor="ctrlFreq">
                  <Select
                    id="ctrlFreq"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {humanLabel(f)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Applicability" htmlFor="ctrlAppl">
                  <Select
                    id="ctrlAppl"
                    value={applicability}
                    onChange={(e) => setApplicability(e.target.value)}
                  >
                    {APPLICABILITIES.map((a) => (
                      <option key={a} value={a}>
                        {humanLabel(a)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {applicability === "NOT_APPLICABLE" && (
                <Field
                  label="Justification"
                  htmlFor="ctrlJust"
                  hint="Required when applicability is Not Applicable"
                >
                  <TextArea
                    id="ctrlJust"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    required
                    maxLength={2000}
                  />
                </Field>
              )}

              <Field label="Implementation notes" htmlFor="ctrlNotes">
                <TextArea
                  id="ctrlNotes"
                  value={implNotes}
                  onChange={(e) => setImplNotes(e.target.value)}
                  maxLength={4000}
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting
                    ? "Saving…"
                    : editControl
                    ? "Update"
                    : "Create"}
                </button>
              </div>
            </form>
          </Modal>

          {/* Delete confirmation */}
          <ConfirmDialog
            open={!!deleteTarget}
            title="Delete control"
            message={
              deleteTarget
                ? depTotal(deleteTarget.deps) > 0
                  ? `${deleteTarget.code} has ${depTotal(deleteTarget.deps)} dependency/ies. You must remove them before deleting.`
                  : `Are you sure you want to delete ${deleteTarget.code}? This cannot be undone.`
                : ""
            }
            confirmLabel="Delete"
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            destructive
          />
        </>
      )}
    </div>
  );
}
