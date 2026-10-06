"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileCheck, Upload, Trash2, Download, Search, X, ScrollText,
  CheckCircle, XCircle, Clock, AlertTriangle, History,
} from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type ControlRef = { id: string; code: string; title: string };
type Control = ControlRef & { frameworkIds: string[] };
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
  control: ControlRef;
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
  const [controlId, setControlId] = useState(preselectedControlId ?? "");
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
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFramework, setPickerFramework] = useState("");
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

  const filteredEvidence = evidenceWithEffective.filter((ev) => {
    if (controlFilter && ev.control.id !== controlFilter) return false;
    if (statusFilter && ev.effectiveStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !ev.fileName.toLowerCase().includes(q) &&
        !ev.notes.toLowerCase().includes(q) &&
        !ev.control.code.toLowerCase().includes(q) &&
        !ev.control.title.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const filteredPickerControls = useMemo(() => {
    if (!pickerFramework) return [];
    return controls.filter((c) => {
      if (!c.frameworkIds.includes(pickerFramework)) return false;
      if (pickerSearch) {
        const q = pickerSearch.toLowerCase();
        if (!c.code.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [controls, pickerSearch, pickerFramework]);

  const filteredPolicies = useMemo(() => {
    if (!policySearch) return policies;
    const q = policySearch.toLowerCase();
    return policies.filter((p) => p.title.toLowerCase().includes(q));
  }, [policies, policySearch]);

  const selectedControl = controls.find((c) => c.id === controlId) ?? null;
  const selectedFramework = frameworks.find((f) => f.id === pickerFramework) ?? null;
  const selectedPolicy = policies.find((p) => p.id === policyId) ?? null;

  // Stats
  const validCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "VALID").length;
  const expiringCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "EXPIRING").length;
  const expiredCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "EXPIRED").length;
  const rejectedCount = evidenceWithEffective.filter((e) => e.effectiveStatus === "REJECTED").length;

  function openUpload(mode: "upload" | "policy" = "upload") {
    setModalMode(mode);
    setControlId(preselectedControlId ?? "");
    setPolicyId("");
    setNotes("");
    setFile(null);
    setError(null);
    setPickerSearch("");
    setPickerFramework("");
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
    if (!controlId) {
      setError("Choose a control.");
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
        body: JSON.stringify({ controlId, policyId, notes }),
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
    body.append("controlId", controlId);
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
    if (selectedControl) {
      return (
        <Field label="Control">
          <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
            <span className="text-xs text-gray-500">{selectedFramework?.name}</span>
            <span className="text-gray-300">›</span>
            <span className="font-mono text-xs text-brand-700">{selectedControl.code}</span>
            <span className="text-sm text-gray-700 truncate">{selectedControl.title}</span>
            <button
              type="button"
              onClick={() => { setControlId(""); setPickerSearch(""); }}
              className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </Field>
      );
    }
    if (!pickerFramework) {
      return (
        <Field label="Framework" hint="Select a framework to see its controls.">
          <div className="grid grid-cols-2 gap-2">
            {frameworks.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPickerFramework(f.id)}
                className="rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                {f.name}
              </button>
            ))}
          </div>
        </Field>
      );
    }
    return (
      <Field label="Control">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setPickerFramework(""); setPickerSearch(""); }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <X className="h-3 w-3" />
              {selectedFramework?.name}
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search controls…"
                className="input !pl-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
            {filteredPickerControls.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-400">No controls match.</p>
            ) : (
              filteredPickerControls.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setControlId(c.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <span className="font-mono text-xs text-gray-600 shrink-0">{c.code}</span>
                  <span className="text-sm text-gray-800 truncate">{c.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Field>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Evidence</h1>
          <p className="mt-1 text-sm text-gray-500">
            Artifacts collected against your controls.
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">File / Policy</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Control</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Validity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Reviewed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Added by</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Size</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEvidence.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{ev.fileName}</p>
                    {ev.policy && (
                      <span className="text-[10px] text-purple-600 capitalize">{ev.policy.status.toLowerCase()}</span>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{ev.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <span className="font-mono text-xs">{ev.control.code}</span>{" "}
                    <span className="text-gray-500">— {ev.control.title}</span>
                  </td>
                  <td className="px-4 py-3">
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
            <Field label="Policy" hint="Select a policy to link as evidence for this control.">
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
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
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
                Control: <span className="font-mono">{reviewTarget.control.code}</span> — {reviewTarget.control.title}
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
