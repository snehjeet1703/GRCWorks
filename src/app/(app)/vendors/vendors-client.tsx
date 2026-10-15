"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, BarChart3, Globe, Mail, Calendar, ShieldAlert, ChevronDown, ChevronUp, ClipboardList, History } from "lucide-react";
import Link from "next/link";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { FilterBar } from "@/components/filter-bar";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";
import { SortSelect, rank, useSort } from "@/components/sortable";

type AssessmentPreview = {
  id: string;
  overallScore: number;
  status: string;
  assessmentDate: string;
};

type VendorRow = {
  id: string;
  name: string;
  description: string;
  website: string;
  category: string;
  status: string;
  criticality: string;
  contactName: string;
  contactEmail: string;
  contractStart: string | null;
  contractEnd: string | null;
  dataAccess: boolean;
  dataTypes: string;
  riskScore: number;
  notes: string;
  assessments: AssessmentPreview[];
  _count: { assessments: number };
};

const CATEGORIES = [
  "CLOUD_INFRASTRUCTURE", "SAAS", "DATA_PROCESSOR", "PROFESSIONAL_SERVICES",
  "IT_SUPPORT", "SECURITY", "HR", "FINANCE", "LEGAL", "OTHER",
] as const;

const STATUSES = ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDING", "UNDER_REVIEW"] as const;
const CRITICALITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function criticalityColor(c: string) {
  const m: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800",
    HIGH: "bg-orange-100 text-orange-800",
    MEDIUM: "bg-amber-100 text-amber-800",
    LOW: "bg-green-100 text-green-800",
  };
  return m[c] ?? "bg-gray-100 text-gray-800";
}

function statusColor(s: string) {
  const m: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700",
    INACTIVE: "bg-gray-100 text-gray-600",
    ONBOARDING: "bg-blue-50 text-blue-700",
    OFFBOARDING: "bg-orange-50 text-orange-700",
    UNDER_REVIEW: "bg-purple-50 text-purple-700",
  };
  return m[s] ?? "bg-gray-100 text-gray-600";
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

export function VendorsClient({
  initialVendors,
  canWrite,
}: {
  initialVendors: VendorRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("content");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<VendorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Assessment modal
  const [showAssessModal, setShowAssessModal] = useState(false);
  const [assessVendor, setAssessVendor] = useState<VendorRow | null>(null);

  // Vendor form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [status, setStatus] = useState<string>("ONBOARDING");
  const [criticality, setCriticality] = useState<string>("MEDIUM");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [dataAccess, setDataAccess] = useState(false);
  const [dataTypes, setDataTypes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Assessment form
  const [securityScore, setSecurityScore] = useState(0);
  const [complianceScore, setComplianceScore] = useState(0);
  const [operationalScore, setOperationalScore] = useState(0);
  const [financialScore, setFinancialScore] = useState(0);
  const [assessFindings, setAssessFindings] = useState("");
  const [assessRecommendations, setAssessRecommendations] = useState("");
  const [assessNotes, setAssessNotes] = useState("");
  const [assessStatus, setAssessStatus] = useState<string>("COMPLETED");

  function resetForm() {
    setName(""); setDescription(""); setWebsite(""); setCategory("OTHER");
    setStatus("ONBOARDING"); setCriticality("MEDIUM"); setContactName("");
    setContactEmail(""); setContractStart(""); setContractEnd("");
    setDataAccess(false); setDataTypes(""); setNotes(""); setError("");
  }

  function resetAssessForm() {
    setSecurityScore(0); setComplianceScore(0); setOperationalScore(0);
    setFinancialScore(0); setAssessFindings(""); setAssessRecommendations("");
    setAssessNotes(""); setAssessStatus("COMPLETED"); setError("");
  }

  function openCreate() {
    resetForm();
    setEditVendor(null);
    setShowModal(true);
  }

  function openEdit(v: VendorRow) {
    setEditVendor(v);
    setName(v.name); setDescription(v.description); setWebsite(v.website);
    setCategory(v.category); setStatus(v.status); setCriticality(v.criticality);
    setContactName(v.contactName); setContactEmail(v.contactEmail);
    setContractStart(v.contractStart?.slice(0, 10) ?? "");
    setContractEnd(v.contractEnd?.slice(0, 10) ?? "");
    setDataAccess(v.dataAccess); setDataTypes(v.dataTypes); setNotes(v.notes);
    setError("");
    setShowModal(true);
  }

  function openAssess(v: VendorRow) {
    resetAssessForm();
    setAssessVendor(v);
    setShowAssessModal(true);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    try {
      const body: any = {
        name: name.trim(), description, website, category, status, criticality,
        contactName, contactEmail, dataAccess, dataTypes, notes,
        contractStart: contractStart ? new Date(contractStart).toISOString() : null,
        contractEnd: contractEnd ? new Date(contractEnd).toISOString() : null,
      };
      const url = editVendor ? `/api/vendors/${editVendor.id}` : "/api/vendors";
      const res = await fetch(url, {
        method: editVendor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success(editVendor ? "Vendor updated" : "Vendor created");
      setShowModal(false);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/vendors/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Vendor deleted");
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Failed to delete vendor");
    }
  }

  async function handleAssess() {
    if (!assessVendor) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/vendors/${assessVendor.id}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: assessStatus,
          securityScore, complianceScore, operationalScore, financialScore,
          findings: assessFindings, recommendations: assessRecommendations,
          notes: assessNotes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save assessment");
      }
      toast.success("Assessment recorded");
      setShowAssessModal(false);
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = initialVendors.filter((v) => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) &&
        !v.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && v.category !== categoryFilter) return false;
    if (statusFilter && v.status !== statusFilter) return false;
    if (criticalityFilter && v.criticality !== criticalityFilter) return false;
    return true;
  });

  const stats = {
    total: initialVendors.length,
    active: initialVendors.filter((v) => v.status === "ACTIVE").length,
    critical: initialVendors.filter((v) => v.criticality === "CRITICAL").length,
    withData: initialVendors.filter((v) => v.dataAccess).length,
  };

  const { sorted: sortedVendors, sort, setSort } = useSort(filtered, {
    name: (v) => v.name,
    criticality: (v) => rank(CRITICALITIES)(v.criticality),
    risk: (v) => v.riskScore,
    status: (v) => v.status,
    contractEnd: (v) => v.contractEnd,
    assessed: (v) => v.assessments[0]?.assessmentDate,
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Vendor Risk Assessment
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage third-party vendors and assess their risk posture
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/vendors/questionnaires" className="btn-secondary flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" /> Questionnaires
          </Link>
          {canWrite && (
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add vendor
            </button>
          )}
        </div>
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Vendors", icon: Building2 },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Vendor", "VendorAssessment"]} title="Vendor Audit Log" />
      )}

      {activeTab === "content" && (<>
      {/* Stats */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        {[
          { label: "Total vendors", value: stats.total, sub: "in registry" },
          { label: "Active", value: stats.active, sub: "currently active" },
          { label: "Critical", value: stats.critical, sub: "critical vendors" },
          { label: "Data access", value: stats.withData, sub: "access your data" },
        ].map((s) => (
          <div key={s.label} className="card !p-[18px]">
            <p className="text-[12.5px] font-medium text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </p>
            <p className="text-[11.5px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search vendors..."
        selects={[
          {
            label: "Category",
            value: categoryFilter,
            onChange: setCategoryFilter,
            options: CATEGORIES.map((c) => ({ label: humanLabel(c), value: c })),
          },
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: STATUSES.map((s) => ({ label: humanLabel(s), value: s })),
          },
          {
            label: "Criticality",
            value: criticalityFilter,
            onChange: setCriticalityFilter,
            options: CRITICALITIES.map((c) => ({ label: humanLabel(c), value: c })),
          },
        ]}
        right={
          <SortSelect
            sort={sort}
            onSort={setSort}
            options={[
              { key: "name", label: "Name" },
              { key: "criticality", label: "Criticality", asc: "highest first", desc: "lowest first" },
              { key: "risk", label: "Risk score", asc: "low → high", desc: "high → low" },
              { key: "status", label: "Status" },
              { key: "contractEnd", label: "Contract end", asc: "soonest first", desc: "latest first" },
              { key: "assessed", label: "Last assessed", asc: "oldest first", desc: "newest first" },
            ]}
          />
        }
      />

      {/* Vendor list */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
            <Building2 className="mb-2 h-10 w-10 opacity-40" />
            <p className="text-sm">No vendors found</p>
          </div>
        )}
        {sortedVendors.map((v) => {
          const latestAssessment = v.assessments[0] ?? null;
          const isExpanded = expandedId === v.id;
          return (
            <div key={v.id} className="card !p-0 overflow-hidden">
              {/* Main row */}
              <div className="flex items-center gap-4 px-4 py-3.5">
                {/* Risk score indicator */}
                <div className="flex flex-col items-center">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${v.riskScore > 0 ? scoreBg(v.riskScore) : "bg-gray-200"} text-white`}>
                    <span className="text-sm font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {v.riskScore > 0 ? v.riskScore : "—"}
                    </span>
                  </div>
                  <span className="mt-0.5 text-[10px] text-gray-400">score</span>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-gray-900">{v.name}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${criticalityColor(v.criticality)}`}>
                      {humanLabel(v.criticality)}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor(v.status)}`}>
                      {humanLabel(v.status)}
                    </span>
                    {v.dataAccess && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        <ShieldAlert className="h-3 w-3" /> data access
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[12px] text-gray-400">
                    <span>{humanLabel(v.category)}</span>
                    {v.contactEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {v.contactEmail}
                      </span>
                    )}
                    {v.website && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {v.website}
                      </span>
                    )}
                    {v._count.assessments > 0 && (
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" /> {v._count.assessments} assessment{v._count.assessments !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {canWrite && (
                    <>
                      <button
                        onClick={() => openAssess(v)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Assess
                      </button>
                      <button
                        onClick={() => openEdit(v)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(v)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                  <div className="grid grid-cols-3 gap-4 text-[12.5px]">
                    <div>
                      <p className="font-medium text-gray-500">Contact</p>
                      <p className="text-gray-700">{v.contactName || "—"}</p>
                      <p className="text-gray-500">{v.contactEmail || "—"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Contract period</p>
                      <p className="text-gray-700">
                        {v.contractStart ? new Date(v.contractStart).toLocaleDateString() : "—"} → {v.contractEnd ? new Date(v.contractEnd).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500">Data types</p>
                      <p className="text-gray-700">{v.dataTypes || "None specified"}</p>
                    </div>
                  </div>
                  {v.description && (
                    <p className="mt-2 text-[12.5px] text-gray-600">{v.description}</p>
                  )}
                  {latestAssessment && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-[12px] font-medium text-gray-500 mb-1.5">Latest assessment — {new Date(latestAssessment.assessmentDate).toLocaleDateString()}</p>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className={`text-xl font-bold ${scoreColor(latestAssessment.overallScore)}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                            {latestAssessment.overallScore}
                          </p>
                          <p className="text-[10px] text-gray-400">overall</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Vendor Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editVendor ? "Edit vendor" : "Add vendor"}
      >
        <div className="space-y-3">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" />
          </Field>
          <Field label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{humanLabel(c)}</option>)}
              </Select>
            </Field>
            <Field label="Criticality">
              <Select value={criticality} onChange={(e) => setCriticality(e.target.value)}>
                {CRITICALITIES.map((c) => <option key={c} value={c}>{humanLabel(c)}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{humanLabel(s)}</option>)}
              </Select>
            </Field>
            <Field label="Website">
              <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="Contact email">
              <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contract start">
              <input className="input" type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
            </Field>
            <Field label="Contract end">
              <input className="input" type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="dataAccess" checked={dataAccess} onChange={(e) => setDataAccess(e.target.checked)} className="rounded border-gray-300" />
            <label htmlFor="dataAccess" className="text-sm text-gray-700">Vendor has access to organizational data</label>
          </div>
          {dataAccess && (
            <Field label="Data types accessed">
              <input className="input" value={dataTypes} onChange={(e) => setDataTypes(e.target.value)} placeholder="PII, financial records, health data..." />
            </Field>
          )}
          <Field label="Notes">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editVendor ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assessment Modal */}
      <Modal
        open={showAssessModal}
        onClose={() => setShowAssessModal(false)}
        title={`Assess: ${assessVendor?.name ?? ""}`}
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Score each dimension from 0 (worst) to 100 (best). The overall score is the average.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Security (0–100)">
              <input className="input" type="number" min={0} max={100} value={securityScore} onChange={(e) => setSecurityScore(Number(e.target.value))} />
            </Field>
            <Field label="Compliance (0–100)">
              <input className="input" type="number" min={0} max={100} value={complianceScore} onChange={(e) => setComplianceScore(Number(e.target.value))} />
            </Field>
            <Field label="Operational (0–100)">
              <input className="input" type="number" min={0} max={100} value={operationalScore} onChange={(e) => setOperationalScore(Number(e.target.value))} />
            </Field>
            <Field label="Financial (0–100)">
              <input className="input" type="number" min={0} max={100} value={financialScore} onChange={(e) => setFinancialScore(Number(e.target.value))} />
            </Field>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
            <p className="text-[12px] text-gray-500">Overall score</p>
            <p className={`text-2xl font-bold ${scoreColor(Math.round((securityScore + complianceScore + operationalScore + financialScore) / 4))}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.round((securityScore + complianceScore + operationalScore + financialScore) / 4)}
            </p>
          </div>
          <Field label="Status">
            <Select value={assessStatus} onChange={(e) => setAssessStatus(e.target.value)}>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </Field>
          <Field label="Findings">
            <TextArea value={assessFindings} onChange={(e) => setAssessFindings(e.target.value)} placeholder="Key findings from the assessment..." rows={3} />
          </Field>
          <Field label="Recommendations">
            <TextArea value={assessRecommendations} onChange={(e) => setAssessRecommendations(e.target.value)} placeholder="Recommended actions..." rows={3} />
          </Field>
          <Field label="Notes">
            <TextArea value={assessNotes} onChange={(e) => setAssessNotes(e.target.value)} rows={2} />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAssessModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleAssess} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Submit assessment"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete vendor"
        message={`Delete "${deleteTarget?.name}"? This will also remove all assessments. This action cannot be undone.`}
      />
      </>)}
    </div>
  );
}
