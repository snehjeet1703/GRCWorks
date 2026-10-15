"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Trash2, Search, Repeat, FileText, PlusCircle, X } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Select } from "@/components/form";
import { FrameworkBadge } from "@/components/framework-badge";
import { useToast } from "@/components/toast";
import type { ControlCoverage, SlotView } from "@/lib/audit-periods";
import { ProgressBar, fmtDay, type Counts } from "../audits-client";
import { SortHeader, useSort } from "@/components/sortable";

type Coverage = {
  period: { id: string; name: string; startDate: string; endDate: string; approvalRequired: boolean; framework: { id: string; name: string } };
  controls: ControlCoverage[];
  counts: Counts;
};

export const SLOT_STYLE: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-green-500 text-white" },
  IN_REVIEW: { label: "In review", cls: "bg-purple-400 text-white" },
  READY: { label: "Uploaded, not submitted", cls: "bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100" },
  CHANGES_REQUESTED: { label: "Changes requested", cls: "bg-amber-400 text-amber-950" },
  OVERDUE: { label: "Missing", cls: "bg-red-500 text-white" },
  DUE: { label: "Due now", cls: "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100" },
  UPCOMING: { label: "Not started", cls: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500" },
};
const GAP = new Set(["OVERDUE", "DUE", "CHANGES_REQUESTED", "READY"]);

const FREQUENCIES = [
  { value: "MONTHLY", label: "Monthly (12 per year)" },
  { value: "QUARTERLY", label: "Quarterly (4 per year)" },
  { value: "ANNUALLY", label: "Once per period" },
];
const freqLabel = (f: string) =>
  ({ MONTHLY: "Monthly", WEEKLY: "Monthly (weekly control)", DAILY: "Monthly (daily control)", QUARTERLY: "Quarterly", ANNUALLY: "Annual", CONTINUOUS: "Once", AS_NEEDED: "Once" } as Record<string, string>)[f] ?? f;

// Short cell text: month initial, quarter number, or a tick for single-slot controls.
function cellText(slot: SlotView, total: number) {
  if (total === 1) return "✓";
  if (slot.label.startsWith("Q")) return slot.label.slice(0, 2);
  return slot.label.slice(0, 3);
}

export function AuditDetailClient({
  coverage, outsideScope, canManage, canEditControls, canExport,
}: {
  coverage: Coverage;
  // Framework controls this period doesn't cover (added to the framework after the period was set up).
  outsideScope: { id: string; code: string; title: string }[];
  canManage: boolean;
  canEditControls: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const { period, controls, counts } = coverage;

  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [detail, setDetail] = useState<{ control: ControlCoverage; slot: SlotView } | null>(null);
  const [freq, setFreq] = useState("QUARTERLY");
  const [onlyAsNeeded, setOnlyAsNeeded] = useState(true);
  const [applying, setApplying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    controls.forEach((c) => c.owner && m.set(c.owner.id, c.owner.name));
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [controls]);
  const asNeeded = controls.filter((c) => ["AS_NEEDED", "CONTINUOUS"].includes(c.frequency)).length;
  const unowned = controls.filter((c) => !c.owner).length;

  const rows = controls.filter((c) => {
    if (owner === "none" ? c.owner : owner && c.owner?.id !== owner) return false;
    if (gapsOnly && !c.slots.some((s) => GAP.has(s.status))) return false;
    const q = search.trim().toLowerCase();
    return !q || [c.code, c.title, c.owner?.name, ...c.requirements].some((v) => v?.toLowerCase().includes(q));
  });

  const now = Date.now();
  const state = now < Date.parse(period.startDate) ? "Upcoming" : now > Date.parse(period.endDate) ? "Closed" : "In progress";
  const pct = counts.total ? Math.round((counts.approved / counts.total) * 100) : 0;

  async function applyFrequency() {
    setApplying(true);
    const res = await fetch(`/api/audit-periods/${period.id}/frequency`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency: freq, onlyAsNeeded }),
    });
    setApplying(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(b?.error ?? "Couldn't update frequencies");
    toast.success(`Updated ${b.updated} control${b.updated === 1 ? "" : "s"}.`);
    startTransition(() => router.refresh());
  }

  const [removeTarget, setRemoveTarget] = useState<ControlCoverage | null>(null);
  const [scopeBusy, setScopeBusy] = useState(false);

  async function changeScope(body: { add?: "all"; remove?: string[] }) {
    setScopeBusy(true);
    const res = await fetch(`/api/audit-periods/${period.id}/scope`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setScopeBusy(false);
    setRemoveTarget(null);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(b?.error ?? "Couldn't change the audit's controls");
    toast.success(b.added ? `Added ${b.added} control${b.added === 1 ? "" : "s"} to this audit.` : "Removed from this audit. Its evidence is kept.");
    startTransition(() => router.refresh());
  }

  async function remove() {
    setConfirmDelete(false);
    const res = await fetch(`/api/audit-periods/${period.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b?.error ?? "Couldn't delete the audit period");
    }
    toast.success(`Deleted ${period.name}.`);
    startTransition(() => router.push("/audits"));
  }

  const { sorted: sortedSortRows, sort: sort, setSort: setSort } = useSort(rows, {
    control: (c) => c.code,
    owner: (c) => c.owner?.name,
    frequency: (c) => c.frequency,
    evidence: (c) => c.slots.length ? c.slots.filter((s) => s.status === "APPROVED").length / c.slots.length : 0,
  }, null);

  return (
    <div>
      <Link href="/audits" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Audits
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <FrameworkBadge name={period.framework.name} size={48} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{period.name}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {period.framework.name} · {fmtDay(period.startDate)} – {fmtDay(period.endDate)} · {state}
              {!period.approvalRequired && " · Approval off"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <a href={`/api/audit-periods/${period.id}/export`} className="btn-primary">
              <Download className="mr-2 h-4 w-4" /> Download evidence package
            </a>
          )}
          {canManage && (
            <button onClick={() => setConfirmDelete(true)} className="btn-secondary !px-2.5" aria-label="Delete audit period" title="Delete audit period">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{pct}%</span> of {counts.total} evidence periods approved
            across {controls.length} controls
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {(["APPROVED", "IN_REVIEW", "READY", "CHANGES_REQUESTED", "OVERDUE", "DUE", "UPCOMING"] as const).map((k) => {
              const n = { APPROVED: counts.approved, IN_REVIEW: counts.inReview, READY: counts.ready, CHANGES_REQUESTED: counts.changesRequested,
                OVERDUE: counts.overdue, DUE: counts.due, UPCOMING: counts.upcoming }[k];
              return (
                <span key={k} className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${SLOT_STYLE[k].cls}`} />
                  {SLOT_STYLE[k].label} <span className="font-medium text-gray-900 dark:text-gray-100">{n}</span>
                </span>
              );
            })}
          </div>
        </div>
        <ProgressBar counts={counts} />
        {(unowned > 0 || asNeeded > 0) && (
          <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {unowned > 0 && <li>• {unowned} control{unowned === 1 ? " has" : "s have"} no owner, so nobody is reminded to collect evidence. Assign owners in Controls.</li>}
            {asNeeded > 0 && <li>• {asNeeded} control{asNeeded === 1 ? " needs" : "s need"} evidence only once for the whole period (frequency &ldquo;As needed&rdquo;).</li>}
          </ul>
        )}
      </div>

      {canManage && outsideScope.length > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 border-blue-200 dark:border-blue-900">
          <div className="min-w-[14rem] flex-1 text-sm">
            <p className="font-medium">
              {outsideScope.length} {period.framework.name} control{outsideScope.length === 1 ? " isn't" : "s aren't"} in this audit
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Mapped to the framework after this audit was set up, or left out on purpose:{" "}
              <span className="font-mono">{outsideScope.slice(0, 8).map((c) => c.code).join(", ")}{outsideScope.length > 8 ? ` and ${outsideScope.length - 8} more` : ""}</span>
            </p>
          </div>
          <button onClick={() => changeScope({ add: "all" })} disabled={scopeBusy} className="btn-secondary">
            <PlusCircle className="mr-1.5 h-4 w-4" /> Add {outsideScope.length === 1 ? "it" : `all ${outsideScope.length}`} to this audit
          </button>
        </div>
      )}

      {canEditControls && (
        <div className="card mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium"><Repeat className="h-4 w-4 text-gray-500" /> Evidence frequency</p>
            <p className="text-xs text-gray-500">How often each control needs fresh evidence during this period.</p>
          </div>
          <Select value={freq} onChange={(e) => setFreq(e.target.value)} aria-label="Frequency" className="!w-auto">
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={onlyAsNeeded} onChange={(e) => setOnlyAsNeeded(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            Only controls on &ldquo;As needed&rdquo; ({asNeeded})
          </label>
          <button onClick={applyFrequency} disabled={applying || (onlyAsNeeded && asNeeded === 0)} className="btn-secondary">
            {applying ? "Applying…" : `Apply to ${onlyAsNeeded ? asNeeded : controls.length} controls`}
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search controls, owners or requirements…" className="input pl-9" />
        </div>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="!w-auto">
          <option value="">All owners</option>
          <option value="none">Unassigned</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
          Only controls with gaps
        </label>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <SortHeader label="Control" sortKey="control" sort={sort} onSort={setSort} className="h-10 px-4" />
                <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={setSort} className="h-10 px-4" />
                <SortHeader label="Frequency" sortKey="frequency" sort={sort} onSort={setSort} className="h-10 px-4" />
                <SortHeader label="Evidence by period" sortKey="evidence" sort={sort} onSort={setSort} className="h-10 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedSortRows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <td className="max-w-xs px-4 py-2.5 align-top">
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100" title={c.title}>
                      <span className="mr-1.5 font-mono text-xs text-gray-500">{c.code}</span>{c.title}
                    </p>
                    {c.requirements.length > 0 && <p className="truncate text-[11px] text-gray-400">{c.requirements.join(", ")}</p>}
                    {canManage && (
                      <button onClick={() => setRemoveTarget(c)} className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-red-600">
                        <X className="h-3 w-3" /> Remove from audit
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top text-gray-600 dark:text-gray-400">
                    {c.owner?.name ?? <span className="text-amber-600">Unassigned</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top text-gray-600 dark:text-gray-400">{freqLabel(c.frequency)}</td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex flex-wrap gap-1">
                      {c.slots.map((s) => (
                        <button
                          key={s.index}
                          onClick={() => setDetail({ control: c, slot: s })}
                          title={`${s.label}: ${SLOT_STYLE[s.status].label}${s.evidence.length ? ` · ${s.evidence.length} file${s.evidence.length === 1 ? "" : "s"}` : ""}`}
                          className={`h-6 min-w-[2rem] rounded px-1.5 text-[10px] font-semibold ${SLOT_STYLE[s.status].cls} ${c.slots.length === 1 ? "min-w-[5rem]" : ""}`}
                        >
                          {c.slots.length === 1 ? SLOT_STYLE[s.status].label : cellText(s, c.slots.length)}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">
            {controls.length === 0 ? `No applicable controls are mapped to ${period.framework.name}.` : "No controls match these filters."}
          </p>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.control.code} · ${detail.slot.label}` : ""} size="md">
        {detail && (
          <div className="space-y-4 text-sm">
            <p className="text-gray-600 dark:text-gray-400">{detail.control.title}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SLOT_STYLE[detail.slot.status].cls}`}>{SLOT_STYLE[detail.slot.status].label}</span>
              <span className="text-xs text-gray-500">{fmtDay(detail.slot.start)} – {fmtDay(detail.slot.end)}</span>
            </div>
            {detail.slot.evidence.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.slot.evidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{e.fileName}</p>
                      <p className="text-xs text-gray-500">
                        {e.uploadedBy ?? "Unknown"} · {fmtDay(e.createdAt)}{e.reviewedBy ? ` · reviewed by ${e.reviewedBy}` : ""}
                      </p>
                    </div>
                    {e.type !== "POLICY" && (
                      <a href={`/api/evidence/${e.id}/download`} className="text-gray-400 hover:text-gray-700" aria-label={`Download ${e.fileName}`}>
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No evidence uploaded for this period.</p>
            )}
            {(detail.slot.submittedBy || detail.slot.reviewedBy || detail.slot.note) && (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                {detail.slot.submittedBy && <><dt className="text-gray-500">Submitted</dt><dd>{detail.slot.submittedBy}{detail.slot.submittedAt ? ` · ${fmtDay(detail.slot.submittedAt)}` : ""}</dd></>}
                {detail.slot.reviewedBy && <><dt className="text-gray-500">Reviewed</dt><dd>{detail.slot.reviewedBy}{detail.slot.reviewedAt ? ` · ${fmtDay(detail.slot.reviewedAt)}` : ""}</dd></>}
                {detail.slot.note && <><dt className="text-gray-500">Note</dt><dd className="whitespace-pre-wrap">{detail.slot.note}</dd></>}
              </dl>
            )}
            <p className="text-xs text-gray-500">
              Owners upload and submit evidence from <Link href="/tasks" className="underline">My tasks</Link>; reviewers approve it there too.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => { if (removeTarget) await changeScope({ remove: [removeTarget.id] }); }}
        title="Remove from this audit"
        confirmLabel="Remove from audit"
        message={`Remove ${removeTarget?.code} ${removeTarget?.title} from ${period.name}? Its evidence and approvals stay on the control, and other audits aren't affected. You can add it back later.`}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete audit period"
        message={`Delete "${period.name}"? Its evidence approvals are removed; the evidence files stay on their controls.`}
      />
    </div>
  );
}
