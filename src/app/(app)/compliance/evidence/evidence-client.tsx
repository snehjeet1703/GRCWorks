"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck, Upload, Trash2, Download, Search, X, ScrollText,
  CheckCircle, XCircle, Clock, AlertTriangle, History, Link2,
} from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";
import { ControlPicker } from "@/components/control-picker";
import { FrameworkBadge } from "@/components/framework-badge";
import { SortHeader, rank, useSort } from "@/components/sortable";

type ControlRef = { id: string; code: string; title: string };
type Control = ControlRef & { frameworkIds: string[]; citations: { frameworkId: string; code: string }[] };
type Framework = { id: string; name: string };
type PolicyRef = { id: string; title: string; status: string };
type EvidenceRow = {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  description: string;
  notes: string;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  createdAt: string;
  controlIds: string[];
  uploadedBy: { id: string; name: string } | null;
  policy: { id: string; title: string; status: string } | null;
};

const EVIDENCE_STATUSES = ["VALID", "EXPIRING", "EXPIRED", "REJECTED"] as const;

function evidenceStatusColor(s: string) {
  const colors: Record<string, string> = {
    VALID: "bg-green-100 text-green-800",
    EXPIRING: "bg-amber-100 text-amber-800",
    EXPIRED: "bg-red-100 text-red-800",
    REJECTED: "bg-red-100 text-red-800",
  };
  return colors[s] ?? "bg-gray-100 text-gray-600";
}

function evidenceStatusIcon(s: string) {
  switch (s) {
    case "VALID": return <CheckCircle className="h-3 w-3" />;
    case "EXPIRING": return <Clock className="h-3 w-3" />;
    case "EXPIRED": return <AlertTriangle className="h-3 w-3" />;
    case "REJECTED": return <XCircle className="h-3 w-3" />;
    default: return null;
  }
}

function computeEffectiveStatus(ev: EvidenceRow): string {
  if (ev.status === "REJECTED") return "REJECTED";
  if (ev.validUntil) {
    const until = new Date(ev.validUntil);
    const now = new Date();
    if (until < now) return "EXPIRED";
    const daysLeft = (until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 30) return "EXPIRING";
  }
  return "VALID";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

// Frameworks (with requirement codes) that a set of controls counts towards.
function coverageFor(controlIds: string[], controlById: Map<string, Control>, frameworks: Framework[]) {
  const codes = new Map<string, Set<string>>();
  for (const id of controlIds) {
    for (const cite of controlById.get(id)?.citations ?? []) {
      if (!codes.has(cite.frameworkId)) codes.set(cite.frameworkId, new Set());
      codes.get(cite.frameworkId)!.add(cite.code);
    }
  }
  return frameworks
    .filter((f) => codes.has(f.id))
    .map((f) => ({ ...f, codes: [...codes.get(f.id)!].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }));
}

function CoverageSummary({ coverage }: { coverage: ReturnType<typeof coverageFor> }) {
  if (coverage.length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Selected controls aren&apos;t mapped to any framework yet.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-green-200 bg-green-50/60 px-3 py-2 dark:border-green-900 dark:bg-green-950/30">
      <p className="mb-1.5 text-xs font-medium text-green-800 dark:text-green-300">Counts towards</p>
      <ul className="space-y-1">
        {coverage.map((f) => (
          <li key={f.id} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
            <FrameworkBadge name={f.name} size={18} className="mt-px !rounded" />
            <span>
              <span className="font-medium">{f.name}</span>{" "}
              <span className="font-mono text-gray-500">{f.codes.slice(0, 6).join(", ")}{f.codes.length > 6 ? ` +${f.codes.length - 6}` : ""}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidenceClient({
  initialEvidence,
  controls,
  frameworks,
  policies,
  preselectedControlId,
  canEdit,
  canReview,
}: {
  initialEvidence: EvidenceRow[];
  controls: Control[];
  frameworks: Framework[];
  policies: PolicyRef[];
  preselectedControlId: string | null;
  canEdit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("content");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"upload" | "policy">("upload");
  const [controlIds, setControlIds] = useState<string[]>(preselectedControlId ? [preselectedControlId] : []);
  const [policyId, setPolicyId] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EvidenceRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [controlFilter, setControlFilter] = useState(preselectedControlId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [editTarget, setEditTarget] = useState<EvidenceRow | null>(null);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [policySearch, setPolicySearch] = useState("");

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<EvidenceRow | null>(null);
  const [reviewStatus, setReviewStatus] = useState("VALID");
  const [reviewValidFrom, setReviewValidFrom] = useState("");
  const [reviewValidUntil, setReviewValidUntil] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const evidenceWithEffective = useMemo(
    () => initialEvidence.map((ev) => ({ ...ev, effectiveStatus: computeEffectiveStatus(ev) })),
    [initialEvidence]
  );

  const controlById = useMemo(() => new Map(controls.map((c) => [c.id, c])), [controls]);
  const frameworkNameById = useMemo(() => new Map(frameworks.map((f) => [f.id, f.name])), [frameworks]);
  const pickerControls = useMemo(
    () => controls.map((c) => ({
      id: c.id, code: c.code, title: c.title,
      frameworkNames: c.frameworkIds.map((id) => frameworkNameById.get(id) ?? "").filter(Boolean),
    })),
    [controls, frameworkNameById]
  );
  const controlsOf = (ev: EvidenceRow) =>
    ev.controlIds.map((id) => controlById.get(id)).filter((c): c is Control => !!c);
  const frameworkIdsOf = (ev: EvidenceRow) =>
    new Set(controlsOf(ev).flatMap((c) => c.frameworkIds));

  const filteredEvidence = evidenceWithEffective.filter((ev) => {
    if (controlFilter && !ev.controlIds.includes(controlFilter)) return false;
    if (frameworkFilter && !frameworkIdsOf(ev).has(frameworkFilter)) return false;
    if (statusFilter && ev.effectiveStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !ev.fileName.toLowerCase().includes(q) &&
        !ev.notes.toLowerCase().includes(q) &&
        !controlsOf(ev).some((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      )
        return false;
    }
    return true;
  });

  const filteredPolicies = useMemo(() => {
    if (!policySearch) return policies;
    const q = policySearch.toLowerCase();
    return policies.filter((p) => p.title.toLowerCase().includes(q));
  }, [policies, policySearch]);

  const selectedPolicy = policies.find((p) => p.id === policyId) ?? null;

  // Stats
  const validCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "VALID").length;
  const expiringCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "EXPIRING").length;
  const expiredCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "EXPIRED").length;
  const rejectedCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "REJECTED").length;

  function openUpload(mode: "upload" | "policy" = "upload") {
    setModalMode(mode);
    setControlIds(preselectedControlId ? [preselectedControlId] : []);
    setPolicyId("");
    setNotes("");
    setFile(null);
    setError(null);
    setPolicySearch("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setModalOpen(true);
  }

  function openReview(ev: EvidenceRow) {
    setReviewTarget(ev);
    setReviewStatus(ev.status);
    setReviewValidFrom(ev.validFrom?.slice(0, 10) ?? "");
    setReviewValidUntil(ev.validUntil?.slice(0, 10) ?? "");
    setReviewNotes(ev.notes);
    setReviewError(null);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    setReviewError(null);

    const res = await fetch(`/api/evidence/${reviewTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: reviewStatus,
        validFrom: reviewValidFrom || null,
        validUntil: reviewValidUntil || null,
        notes: reviewNotes,
      }),
    });
    setReviewSubmitting(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setReviewError(b?.error ?? "Review failed");
      return;
    }
    setReviewTarget(null);
    toast.success("Evidence reviewed.");
    startTransition(() => router.refresh());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (controlIds.length === 0) {
      setError("Choose at least one control.");
      return;
    }

    if (modalMode === "policy") {
      if (!policyId) {
        setError("Choose a policy to link.");
        return;
      }
      setSubmitting(true);
      setError(null);
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlIds, policyId, notes }),
      });
      setSubmitting(false);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b?.error ?? "Failed to link policy");
        return;
      }
      setModalOpen(false);
      toast.success("Policy linked as evidence.");
      startTransition(() => router.refresh());
      return;
    }

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = new FormData();
    for (const id of controlIds) body.append("controlIds", id);
    body.append("notes", notes);
    body.append("file", file);
    const res = await fetch("/api/evidence", { method: "POST", body });
    setSubmitting(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b?.error ?? "Upload failed");
      return;
    }
    setModalOpen(false);
    toast.success("Evidence uploaded.");
    startTransition(() => router.refresh());
  }

  function openEditControls(ev: EvidenceRow) {
    setEditTarget(ev);
    setEditIds(ev.controlIds);
    setEditError(null);
  }

  async function saveEditControls() {
    if (!editTarget) return;
    if (editIds.length === 0) {
      setEditError("Evidence must support at least one control.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/evidence/${editTarget.id}/controls`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlIds: editIds }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setEditError(b?.error ?? "Couldn't update controls");
      return;
    }
    setEditTarget(null);
    toast.success("Controls updated.");
    startTransition(() => router.refresh());
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/evidence/${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Delete failed");
      return;
    }
    toast.success(`Deleted "${target.fileName}".`);
    startTransition(() => router.refresh());
  }

  function renderControlPicker() {
    return (
      <Field
        label="Controls"
        hint="Pick every control this proves. Evidence attaches to your controls, so it counts towards each framework they map to."
      >
        <div className="space-y-2">
          <ControlPicker allControls={pickerControls} selectedIds={controlIds} onChange={setControlIds} />
          {controlIds.length > 0 && <CoverageSummary coverage={coverageFor(controlIds, controlById, frameworks)} />}
        </div>
      </Field>
    );
  }

  const { sorted: sortedSortRows, sort: sort, setSort: setSort } = useSort(filteredEvidence, {
    type: (ev) => ev.type,
    file: (ev) => ev.fileName,
    controls: (ev) => controlsOf(ev)[0]?.code,
    frameworks: (ev) => new Set(controlsOf(ev).flatMap((c) => c.frameworkIds)).size,
    status: (ev) => ev.effectiveStatus,
    validity: (ev) => ev.validUntil,
    reviewed: (ev) => ev.reviewedAt,
    addedBy: (ev) => ev.uploadedBy?.name,
    size: (ev) => ev.fileSize,
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Evidence</h1>
          <p className="mt-1 text-sm text-gray-500">
            Proof attached to your controls. Each file counts towards every framework its controls map to.
            {preselectedControlId && " Filtered to one control."}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => openUpload("policy")}>
              <ScrollText className="h-4 w-4 mr-2" />
              Link policy
            </button>
            <button className="btn-primary" onClick={() => openUpload("upload")}>
              <Upload className="h-4 w-4 mr-2" />
              Upload evidence
            </button>
          </div>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Evidence", icon: FileCheck },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Evidence"]} title="Evidence Audit Log" />
      )}

      {activeTab === "content" && (<>
      {/* Lifecycle summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="card !py-3 !px-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Valid</p>
          <p className="text-2xl font-semibold text-green-700 mt-1">{validCount}</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Expiring</p>
          <p className="text-2xl font-semibold text-amber-600 mt-1">{expiringCount}</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Expired</p>
          <p className="text-2xl font-semibold text-red-600 mt-1">{expiredCount}</p>
        </div>
        <div className="card !py-3 !px-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Rejected</p>
          <p className="text-2xl font-semibold text-red-700 mt-1">{rejectedCount}</p>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search evidence by filename, notes, or control…"
        selects={[
          {
            label: "Framework",
            value: frameworkFilter,
            onChange: setFrameworkFilter,
            options: frameworks.map((f) => ({ value: f.id, label: f.name })),
          },
          {
            label: "Control",
            value: controlFilter,
            onChange: setControlFilter,
            options: controls.map((c) => ({
              value: c.id,
              label: `${c.code} — ${c.title}`,
            })),
          },
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: EVIDENCE_STATUSES.map((s) => ({
              value: s,
              label: s.toLowerCase(),
            })),
          },
        ]}
      />

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border">
                <SortHeader label="Type" sortKey="type" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="File / Policy" sortKey="file" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Controls" sortKey="controls" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Frameworks" sortKey="frameworks" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Validity" sortKey="validity" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Reviewed" sortKey="reviewed" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Added by" sortKey="addedBy" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground" />
                <SortHeader label="Size" sortKey="size" sort={sort} onSort={setSort} className="h-10 whitespace-nowrap px-4 text-right align-middle text-xs font-medium text-muted-foreground" align="right" />
                <th className="h-10 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedSortRows.map((ev) => (
                <tr key={ev.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 align-middle">
                    {ev.type === "POLICY" ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                        <ScrollText className="h-3 w-3" />
                        Policy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        <FileCheck className="h-3 w-3" />
                        Upload
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <p className="text-sm font-medium text-gray-900">{ev.fileName}</p>
                    {ev.policy && (
                      <span className="text-[10px] text-purple-600 capitalize">{ev.policy.status.toLowerCase()}</span>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{ev.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {controlsOf(ev).slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          title={c.title}
                          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {c.code}
                        </span>
                      ))}
                      {ev.controlIds.length > 3 && (
                        <span
                          title={controlsOf(ev).slice(3).map((c) => c.code).join(", ")}
                          className="px-1 py-0.5 text-[11px] text-gray-500"
                        >
                          +{ev.controlIds.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {(() => {
                      const fws = frameworks.filter((f) => frameworkIdsOf(ev).has(f.id));
                      if (fws.length === 0) return <span className="text-xs text-gray-400">None mapped</span>;
                      return (
                        <div className="flex items-center gap-1" title={fws.map((f) => f.name).join(", ")}>
                          {fws.slice(0, 4).map((f) => <FrameworkBadge key={f.id} name={f.name} size={22} className="!rounded-md" />)}
                          {fws.length > 4 && <span className="text-[11px] text-gray-500">+{fws.length - 4}</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${evidenceStatusColor(ev.effectiveStatus)}`}>
                      {evidenceStatusIcon(ev.effectiveStatus)}
                      {ev.effectiveStatus.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {ev.validFrom || ev.validUntil ? (
                      <span>
                        {formatDate(ev.validFrom)} — {formatDate(ev.validUntil)}
                      </span>
                    ) : (
                      <span className="text-gray-400">No expiry</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {ev.reviewedBy ? (
                      <span>
                        {ev.reviewedBy.name}
                        <br />
                        <span className="text-gray-400">{formatDate(ev.reviewedAt)}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">Not reviewed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {ev.uploadedBy?.name ?? "(deleted user)"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {ev.type === "POLICY" ? "—" : formatSize(ev.fileSize)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canReview && (
                        <button
                          onClick={() => openReview(ev)}
                          className="rounded p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                          aria-label="Review evidence"
                          title="Review"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => openEditControls(ev)}
                          className="rounded p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600"
                          aria-label="Edit linked controls"
                          title="Edit linked controls"
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                      )}
                      {ev.type !== "POLICY" && (
                        <a
                          href={`/api/evidence/${ev.id}/download`}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setDeleteTarget(ev)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete evidence"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredEvidence.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileCheck className="h-8 w-8 mb-2" />
            <p className="text-sm">
              {initialEvidence.length === 0
                ? "No evidence uploaded yet."
                : "No evidence matches the current filters."}
            </p>
          </div>
        )}
      </div>

      {/* Upload / Link policy modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "policy" ? "Link policy as evidence" : "Upload evidence"}
        size="md"
      >
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />

          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => setModalMode("upload")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                modalMode === "upload"
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setModalMode("policy")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                modalMode === "policy"
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Link policy
            </button>
          </div>

          {renderControlPicker()}

          {modalMode === "policy" ? (
            <Field label="Policy" hint="Select a policy to link as evidence for these controls.">
              {selectedPolicy ? (
                <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                  <ScrollText className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="text-sm text-gray-800 truncate">{selectedPolicy.title}</span>
                  <span className="text-[10px] text-purple-600 capitalize">{selectedPolicy.status.toLowerCase()}</span>
                  <button
                    type="button"
                    onClick={() => setPolicyId("")}
                    className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    aria-label="Clear selection"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={policySearch}
                      onChange={(e) => setPolicySearch(e.target.value)}
                      placeholder="Search policies…"
                      className="input !pl-8 text-sm"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                    {filteredPolicies.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-gray-400">No policies found.</p>
                    ) : (
                      filteredPolicies.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPolicyId(p.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 border-b border-border last:border-0"
                        >
                          <ScrollText className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          <span className="text-sm text-gray-800 truncate">{p.title}</span>
                          <span className="ml-auto text-[10px] text-gray-400 capitalize">{p.status.toLowerCase()}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Field>
          ) : (
            <Field label="File" htmlFor="file" hint="Max 20 MB.">
              <input
                ref={fileInputRef}
                id="file"
                type="file"
                required={modalMode === "upload"}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="input"
              />
            </Field>
          )}

          <Field label="Notes" htmlFor="notes" hint="Optional. Describe what this evidence demonstrates.">
            <TextArea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting
                ? modalMode === "policy" ? "Linking…" : "Uploading…"
                : modalMode === "policy" ? "Link policy" : "Upload"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review modal */}
      <Modal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title="Review evidence"
        size="md"
      >
        {reviewTarget && (
          <form onSubmit={submitReview} className="space-y-4">
            <FormError message={reviewError} />
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">{reviewTarget.fileName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {reviewTarget.controlIds.length === 1 ? "Control" : "Controls"}:{" "}
                <span className="font-mono">{controlsOf(reviewTarget).map((c) => c.code).join(", ")}</span>
              </p>
            </div>
            <Field label="Review decision" htmlFor="reviewStatus">
              <Select
                id="reviewStatus"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value)}
              >
                <option value="VALID">Approve (Valid)</option>
                <option value="REJECTED">Reject</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valid from" htmlFor="reviewFrom">
                <input
                  id="reviewFrom"
                  type="date"
                  className="input"
                  value={reviewValidFrom}
                  onChange={(e) => setReviewValidFrom(e.target.value)}
                />
              </Field>
              <Field label="Valid until" htmlFor="reviewUntil" hint="Evidence expires after this date.">
                <input
                  id="reviewUntil"
                  type="date"
                  className="input"
                  value={reviewValidUntil}
                  onChange={(e) => setReviewValidUntil(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Review notes" htmlFor="reviewNotes">
              <TextArea
                id="reviewNotes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReviewTarget(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={reviewSubmitting} className="btn-primary">
                {reviewSubmitting ? "Saving…" : "Submit review"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit linked controls */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Linked controls" size="md">
        {editTarget && (
          <div className="space-y-4">
            <FormError message={editError} />
            <p className="text-sm text-gray-600">
              Choose every control <span className="font-medium text-gray-900">{editTarget.fileName}</span> proves.
            </p>
            <ControlPicker allControls={pickerControls} selectedIds={editIds} onChange={setEditIds} />
            {editIds.length > 0 && <CoverageSummary coverage={coverageFor(editIds, controlById, frameworks)} />}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={saveEditControls} disabled={editSaving} className="btn-primary">
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete evidence"
        message={`Delete "${deleteTarget?.fileName}"? ${deleteTarget?.type === "POLICY" ? "The policy link will be removed." : "The file will be removed from storage."}`}
      />

      </>)}
    </div>
  );
}
