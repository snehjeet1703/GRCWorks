"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ListChecks,
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
import { FrameworkBadge } from "@/components/framework-badge";
import { SortHeader, rank, useSort } from "@/components/sortable";

type UserRef = { id: string; name: string };
type ControlRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: string;
  reviewState: string;
  frequency: string;
  applicability: string;
  applicabilityJustification: string;
  implementationNotes: string;
  ownerId: string | null;
  ownerName: string | null;
  frameworks: { id: string; name: string; codes: string[] }[];
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
  frameworks,
  canEdit,
}: {
  initialControls: ControlRow[];
  users: UserRef[];
  frameworks: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
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
    if (frameworkFilter === "none" ? c.frameworks.length > 0 : frameworkFilter && !c.frameworks.some((f) => f.id === frameworkFilter)) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.code.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q) &&
        !c.frameworks.some((f) => f.name.toLowerCase().includes(q) || f.codes.some((code) => code.toLowerCase().includes(q)))
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

  const { sorted: sortedSortRows, sort: sort, setSort: setSort } = useSort(filtered, {
    code: (c) => c.code,
    title: (c) => c.title,
    frameworks: (c) => c.frameworks.map((f) => f.name).join(", "),
    owner: (c) => c.ownerName,
    status: (c) => rank(STATUSES)(c.status),
    frequency: (c) => c.frequency,
    applicability: (c) => c.applicability,
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Controls</h1>
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
          { key: "content", label: "Controls", icon: ListChecks },
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
            searchPlaceholder="Search controls, frameworks or requirement codes (e.g. CC6.1)…"
            selects={[
              {
                label: "Framework",
                value: frameworkFilter,
                onChange: setFrameworkFilter,
                options: [
                  ...frameworks.map((f) => ({ value: f.id, label: f.name })),
                  { value: "none", label: "Not mapped to any framework" },
                ],
              },
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
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <SortHeader label="Code" sortKey="code" sort={sort} onSort={setSort} className="h-10 w-px whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Title" sortKey="title" sort={sort} onSort={setSort} className="h-10 w-full min-w-[16rem] whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Frameworks" sortKey="frameworks" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Status" sortKey="status" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Frequency" sortKey="frequency" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <SortHeader label="Applicability" sortKey="applicability" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                    <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">
                      Deps
                    </th>
                    {canEdit && (
                      <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedSortRows.map((c) => (
                    <tr
                      key={c.id}
                      className="transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => canEdit ? openEdit(c) : undefined}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                        {c.code}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <p className="text-sm text-gray-900">{c.title}</p>
                        {c.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {c.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {c.frameworks.length === 0 ? (
                          <span className="text-xs text-gray-400">Not mapped</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {c.frameworks.slice(0, 4).map((f) => (
                              <span key={f.id} title={`${f.name}: ${f.codes.join(", ")}`}>
                                <FrameworkBadge name={f.name} size={22} className="!rounded-md" />
                              </span>
                            ))}
                            {c.frameworks.length > 4 && (
                              <span
                                className="text-[11px] text-gray-500"
                                title={c.frameworks.slice(4).map((f) => `${f.name}: ${f.codes.join(", ")}`).join("\n")}
                              >
                                +{c.frameworks.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {c.ownerName || "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`badge ${getControlStatusColor(c.status)}`}
                        >
                          {humanLabel(c.status)}
                        </span>
                        {c.reviewState === "PENDING" && (
                          <span className="ml-1.5 badge bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">In review</span>
                        )}
                        {c.reviewState === "CHANGES_REQUESTED" && (
                          <span className="ml-1.5 badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Changes requested</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 capitalize">
                        {humanLabel(c.frequency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 capitalize">
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
                <ListChecks className="mx-auto h-8 w-8 text-gray-300" />
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
            onClose={() => setDeleteTarget(null)}
          />
        </>
      )}
    </div>
  );
}
