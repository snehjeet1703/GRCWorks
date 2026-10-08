"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCheck, AlertTriangle, ScrollText, ClipboardCheck, Clock, History } from "lucide-react";
import { getControlStatusColor } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { Modal } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";

type Owner = { id: string; name: string };
type ControlRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "NOT_APPLICABLE";
  frequency: string;
  ownerId: string | null;
  ownerName: string | null;
  evidenceCount: number;
  risksCount: number;
  policiesCount: number;
  otherFrameworks: { name: string; code: string }[];
  lastTestResult: "PASS" | "FAIL" | "NOT_TESTED" | null;
  lastTestDate: string | null;
  nextTestDue: string | null;
};

const STATUSES: ControlRow["status"][] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IMPLEMENTED",
  "NOT_APPLICABLE",
];

function humanStatus(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

function humanFreq(f: string) {
  return f.toLowerCase().replaceAll("_", " ");
}

function isOverdue(nextDue: string | null): boolean {
  if (!nextDue) return false;
  return new Date(nextDue) < new Date();
}

function testBadge(control: ControlRow) {
  if (!control.lastTestResult) {
    return { label: "Not tested", color: "text-gray-400", overdue: false };
  }
  const overdue = isOverdue(control.nextTestDue);
  if (control.lastTestResult === "PASS") {
    return {
      label: overdue ? "Overdue" : "Pass",
      color: overdue ? "text-amber-600" : "text-emerald-600",
      overdue,
    };
  }
  if (control.lastTestResult === "FAIL") {
    return { label: "Fail", color: "text-red-600", overdue };
  }
  return { label: "Not tested", color: "text-gray-400", overdue: false };
}

export function FrameworkControlsClient({
  initialControls,
  users,
  canEdit,
}: {
  initialControls: ControlRow[];
  users: Owner[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [activeTab, setActiveTab] = useState("content");
  const [testModal, setTestModal] = useState<ControlRow | null>(null);
  const [testResult, setTestResult] = useState<"PASS" | "FAIL">("PASS");
  const [testNotes, setTestNotes] = useState("");
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const filteredControls = initialControls.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (ownerFilter === "unassigned" && c.ownerId) return false;
    if (ownerFilter && ownerFilter !== "unassigned" && c.ownerId !== ownerFilter) return false;
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

  async function updateControl(controlId: string, data: Record<string, unknown>) {
    setPendingId(controlId);
    const res = await fetch(`/api/controls/${controlId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setPendingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Update failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  function openTestModal(control: ControlRow) {
    setTestModal(control);
    setTestResult("PASS");
    setTestNotes("");
    setTestError(null);
  }

  async function submitTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testModal) return;
    setTestSubmitting(true);
    setTestError(null);
    const res = await fetch(`/api/controls/${testModal.id}/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: testResult,
        testDate: new Date().toISOString(),
        notes: testNotes,
      }),
    });
    setTestSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTestError(body?.error ?? "Failed to record test");
      return;
    }
    setTestModal(null);
    toast.success(`Test recorded for ${testModal.code}.`);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <PageTabs
        tabs={[
          { key: "content", label: "Controls", icon: FileCheck },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["Control", "ControlTest"]} title="Controls Audit Log" />
      )}

      {activeTab === "content" && (<>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search controls by code, title, or description…"
        selects={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: STATUSES.map((s) => ({ value: s, label: humanStatus(s) })),
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

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Code</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Title</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Owner</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Status</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Testing</th>
                <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredControls.map((control) => {
                const test = testBadge(control);
                return (
                  <tr key={control.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                      {control.code}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="text-sm text-gray-900">{control.title}</p>
                      {control.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {control.description}
                        </p>
                      )}
                      {control.otherFrameworks.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-gray-400">
                            Also satisfies
                          </span>
                          {control.otherFrameworks.map((f) => (
                            <span
                              key={f.name + f.code}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800"
                              title={`${f.name} — implementation counts here too`}
                            >
                              <span className="font-medium">{f.name.replace(" Security Rule", "").replace(" Type II", "")}</span>
                              <span className="font-mono">{f.code}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {canEdit ? (
                        <select
                          disabled={pendingId === control.id}
                          value={control.ownerId ?? ""}
                          onChange={(e) =>
                            updateControl(control.id, {
                              ownerId: e.target.value || null,
                            })
                          }
                          className="input !py-1 !px-2 !w-auto text-xs"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-gray-500">
                          {control.ownerName || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {canEdit ? (
                        <select
                          disabled={pendingId === control.id}
                          value={control.status}
                          onChange={(e) =>
                            updateControl(control.id, {
                              status: e.target.value,
                            })
                          }
                          className={`input !py-1 !px-2 !w-auto text-xs font-medium ${getControlStatusColor(
                            control.status
                          )}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {humanStatus(s)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`badge ${getControlStatusColor(control.status)}`}
                        >
                          {humanStatus(control.status)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${test.color}`}>
                          {test.overdue && <Clock className="inline h-3 w-3 mr-0.5" />}
                          {test.label}
                        </span>
                        {control.lastTestDate && (
                          <span className="text-[10px] text-gray-400">
                            {new Date(control.lastTestDate).toISOString().slice(0, 10)}
                          </span>
                        )}
                        {control.frequency !== "AS_NEEDED" && control.frequency !== "CONTINUOUS" && (
                          <span className="text-[10px] text-gray-400">
                            ({humanFreq(control.frequency)})
                          </span>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => openTestModal(control)}
                            className="ml-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Record test"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <Link
                          href={`/compliance/evidence?controlId=${control.id}`}
                          className="inline-flex items-center gap-1 hover:text-brand-700"
                          title="Evidence"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          {control.evidenceCount}
                        </Link>
                        <span
                          className="inline-flex items-center gap-1"
                          title={`${control.risksCount} linked risk${control.risksCount === 1 ? "" : "s"}`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {control.risksCount}
                        </span>
                        <span
                          className="inline-flex items-center gap-1"
                          title={`${control.policiesCount} linked polic${control.policiesCount === 1 ? "y" : "ies"}`}
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                          {control.policiesCount}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredControls.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            No controls match the current filters.
          </p>
        )}
      </div>

      <Modal
        open={!!testModal}
        onClose={() => setTestModal(null)}
        title={`Record test — ${testModal?.code ?? ""}`}
        size="md"
      >
        <form onSubmit={submitTest} className="space-y-4">
          <FormError message={testError} />
          <p className="text-sm text-gray-600">{testModal?.title}</p>
          {testModal?.frequency && testModal.frequency !== "AS_NEEDED" && testModal.frequency !== "CONTINUOUS" && (
            <p className="text-xs text-gray-400">
              Testing schedule: {humanFreq(testModal.frequency)}
              {testModal.nextTestDue && (
                <> · Next due: {new Date(testModal.nextTestDue).toISOString().slice(0, 10)}</>
              )}
            </p>
          )}
          {testModal && testModal.evidenceCount === 0 && testResult === "PASS" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This control has no evidence. Upload evidence or link a policy before marking it as passed.
            </div>
          )}
          <Field label="Result" htmlFor="testResult">
            <Select
              id="testResult"
              value={testResult}
              onChange={(e) => setTestResult(e.target.value as "PASS" | "FAIL")}
            >
              <option value="PASS">Pass</option>
              <option value="FAIL">Fail</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="testNotes" hint="Describe what was tested and the outcome.">
            <TextArea
              id="testNotes"
              value={testNotes}
              onChange={(e) => setTestNotes(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setTestModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={testSubmitting || (testResult === "PASS" && testModal !== null && testModal.evidenceCount === 0)}
              className="btn-primary"
            >
              {testSubmitting ? "Saving…" : "Record test"}
            </button>
          </div>
        </form>
      </Modal>

      </>)}
    </div>
  );
}
