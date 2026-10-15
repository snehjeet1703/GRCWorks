"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList, Plus, Trash2, Send, Eye, CheckCircle2, Clock,
  ChevronDown, ChevronUp, FileQuestion, ArrowLeft, Upload, Download, History, FileSpreadsheet,
} from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, Select, TextArea, FormError } from "@/components/form";
import { useToast } from "@/components/toast";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { PageTabs } from "@/components/page-tabs";
import { IssuedLinkDialog, ResponsesPanel } from "./responses-panel";
import { ImportQuestionsModal, readQuestionSheet, SheetIssues, type SheetResult } from "./import-questions-modal";

type QuestionnaireRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
  _count: { responses: number };
};

type Question = {
  id: string;
  text: string;
  type: string;
  required: boolean;
  options: string[];
  category: string;
};

type VendorOption = { id: string; name: string; category: string; contactEmail: string };

const QUESTION_TYPES = [
  { value: "TEXT", label: "Free text" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTI_CHOICE", label: "Multiple choice" },
  { value: "RATING", label: "Rating (1-5)" },
  { value: "FILE_UPLOAD", label: "File upload" },
] as const;

const Q_CATEGORIES = ["GENERAL", "SECURITY", "COMPLIANCE", "DATA_PRIVACY", "BUSINESS_CONTINUITY", "ACCESS_CONTROL", "INCIDENT_RESPONSE"] as const;

function statusBadge(s: string) {
  const m: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    PUBLISHED: "bg-green-50 text-green-700",
    ARCHIVED: "bg-orange-50 text-orange-700",
  };
  return m[s] ?? "bg-gray-100 text-gray-600";
}

function humanLabel(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

let questionCounter = 0;
function newQuestionId() {
  return `q_${Date.now()}_${++questionCounter}`;
}

export function QuestionnairesClient({
  initialQuestionnaires,
  vendors,
  canWrite,
}: {
  initialQuestionnaires: QuestionnaireRow[];
  vendors: VendorOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Modals
  const [activeTab, setActiveTab] = useState("content");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<QuestionnaireRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireRow | null>(null);
  const [sendTarget, setSendTarget] = useState<QuestionnaireRow | null>(null);
  const [viewTarget, setViewTarget] = useState<QuestionnaireRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [formStatus, setFormStatus] = useState("DRAFT");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Send modal
  const [sendVendorId, setSendVendorId] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [issued, setIssued] = useState<{ link: string; email: string; emailSent: boolean } | null>(null);
  const [responsesTarget, setResponsesTarget] = useState<QuestionnaireRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetIssues, setSheetIssues] = useState<SheetResult | null>(null);
  const [readingSheet, setReadingSheet] = useState(false);

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("GENERAL");
    setFormStatus("DRAFT"); setQuestions([]); setError(""); setSheetIssues(null);
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setShowCreateModal(true);
  }

  function openEdit(q: QuestionnaireRow) {
    setEditTarget(q);
    setTitle(q.title);
    setDescription(q.description);
    setCategory(q.category);
    setFormStatus(q.status);
    setQuestions(q.questions ?? []);
    setError("");
    setSheetIssues(null);
    setShowCreateModal(true);
  }

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { id: newQuestionId(), text: "", type: "TEXT", required: true, options: [], category: "" },
    ]);
  }

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function addOption(idx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, options: [...q.options, ""] } : q))
    );
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: q.options.map((o, j) => (j === oIdx ? value : o)) }
          : q
      )
    );
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q
      )
    );
  }


  // Adds questions from a filled-in sheet (.xlsx or .csv) to the questionnaire being edited.
  async function importIntoEditor(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReadingSheet(true); setError(""); setSheetIssues(null);
    try {
      const result: SheetResult = await readQuestionSheet(file);
      if (result.errors.length) { setSheetIssues(result); return; }
      setQuestions((prev) => [...prev, ...result.questions]);
      if (result.warnings.length) setSheetIssues(result);
      toast.success(`Added ${result.questions.length} question${result.questions.length === 1 ? "" : "s"} from ${file.name}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReadingSheet(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (questions.length === 0) { setError("Add at least one question"); return; }
    const emptyQ = questions.find((q) => !q.text.trim());
    if (emptyQ) { setError("All questions must have text"); return; }

    setSaving(true); setError("");
    try {
      const body = { title: title.trim(), description, category, status: formStatus, questions };
      const url = editTarget ? `/api/vendors/questionnaires/${editTarget.id}` : "/api/vendors/questionnaires";
      const res = await fetch(url, {
        method: editTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success(editTarget ? "Questionnaire updated" : "Questionnaire created");
      setShowCreateModal(false);
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
      const res = await fetch(`/api/vendors/questionnaires/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Questionnaire deleted");
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Failed to delete questionnaire");
    }
  }

  async function handleSend() {
    if (!sendTarget || !sendVendorId) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/vendors/${sendVendorId}/questionnaire-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaireId: sendTarget.id, contactEmail: sendEmail.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setIssued({ link: data.inviteLink, email: data.contactEmail, emailSent: data.emailSent });
      setSendTarget(null);
      setSendVendorId("");
      setSendEmail("");
      startTransition(() => router.refresh());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const stats = {
    total: initialQuestionnaires.length,
    published: initialQuestionnaires.filter((q) => q.status === "PUBLISHED").length,
    draft: initialQuestionnaires.filter((q) => q.status === "DRAFT").length,
    totalResponses: initialQuestionnaires.reduce((acc, q) => acc + q._count.responses, 0),
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/vendors" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">
              Vendor Questionnaires
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage due diligence questionnaires for vendor assessments
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Import from sheet
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> New questionnaire
            </button>
          </div>
        )}
      </div>

      <PageTabs
        tabs={[
          { key: "content", label: "Questionnaires", icon: ClipboardList },
          { key: "audit", label: "Audit Log", icon: History },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "audit" && (
        <AuditLogPanel entityTypes={["vendorquestionnaire", "QuestionnaireResponse"]} title="Questionnaire Audit Log" />
      )}

      {activeTab === "content" && (<>
      {/* Stats */}
      <div className="mb-5 grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, sub: "questionnaires" },
          { label: "Published", value: stats.published, sub: "ready to send" },
          { label: "Drafts", value: stats.draft, sub: "in progress" },
          { label: "Responses", value: stats.totalResponses, sub: "received" },
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

      {/* List */}
      <div className="space-y-2">
        {initialQuestionnaires.length === 0 && (
          <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
            <ClipboardList className="mb-2 h-10 w-10 opacity-40" />
            <p className="text-sm">No questionnaires yet</p>
            {canWrite && (
              <button onClick={openCreate} className="mt-2 text-sm text-brand-600 hover:underline">
                Create your first questionnaire
              </button>
            )}
          </div>
        )}
        {initialQuestionnaires.map((q) => {
          const isExpanded = expandedId === q.id;
          return (
            <div key={q.id} className="card !p-0 overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <FileQuestion className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-gray-900">{q.title}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(q.status)}`}>
                      {humanLabel(q.status)}
                    </span>
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {humanLabel(q.category)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[12px] text-gray-400">
                    <span>{q.questions?.length ?? 0} question{(q.questions?.length ?? 0) !== 1 ? "s" : ""}</span>
                    <span>{q._count.responses} response{q._count.responses !== 1 ? "s" : ""}</span>
                    <span>Updated {new Date(q.updatedAt).toLocaleDateString("en-US")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setResponsesTarget(q)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Responses
                  </button>
                  {canWrite && q.status === "PUBLISHED" && (
                    <button
                      onClick={() => { setSendTarget(q); setSendVendorId(""); setSendEmail(""); setError(""); }}
                      className="rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
                    >
                      <Send className="mr-1 inline h-3 w-3" /> Send
                    </button>
                  )}
                  {canWrite && (
                    <>
                      <button
                        onClick={() => openEdit(q)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(q)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                  {q.description && <p className="mb-3 text-[12.5px] text-gray-600">{q.description}</p>}
                  <p className="mb-2 text-[12px] font-medium text-gray-500">Questions preview:</p>
                  <div className="space-y-1.5">
                    {(q.questions ?? []).map((qn, i) => (
                      <div key={qn.id} className="flex items-start gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2">
                        <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[10px] font-medium text-gray-500">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] text-gray-800">{qn.text}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                            <span>{humanLabel(qn.type)}</span>
                            {qn.required && <span className="text-red-400">required</span>}
                            {qn.options.length > 0 && (
                              <span>{qn.options.length} option{qn.options.length !== 1 ? "s" : ""}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={editTarget ? "Edit questionnaire" : "New questionnaire"}
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="Title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Security Due Diligence" />
          </Field>
          <Field label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Purpose and scope of this questionnaire" rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Q_CATEGORIES.map((c) => <option key={c} value={c}>{humanLabel(c)}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
          </div>

          {/* Questions builder */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Questions ({questions.length})</p>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/vendors/questionnaires/template${editTarget ? `?questionnaireId=${editTarget.id}` : ""}`}
                  download
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  title={editTarget ? "Download this questionnaire's questions as a sheet" : "Download the question sheet template"}
                >
                  <Download className="h-3 w-3" /> Template
                </a>
                <label className="text-xs text-brand-600 hover:underline flex items-center gap-1 cursor-pointer" title="Add questions from a filled-in sheet">
                  <Upload className="h-3 w-3" /> {readingSheet ? "Reading…" : "Import from sheet"}
                  <input type="file" accept=".xlsx,.csv" onChange={importIntoEditor} className="hidden" disabled={readingSheet} />
                </label>
                <button onClick={addQuestion} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add question
                </button>
              </div>
            </div>
            <p className="mb-2 text-[11px] text-gray-400">
              Add questions one by one, or download the template (.xlsx), fill it in and import it. Imported questions are added to the end.
            </p>
            {sheetIssues && <div className="mb-3 space-y-2"><SheetIssues result={sheetIssues} /></div>}
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-brand-100 text-[10px] font-bold text-brand-700">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <input
                        className="input text-sm"
                        value={q.text}
                        onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                        placeholder="Enter your question..."
                      />
                      <div className="flex items-center gap-2">
                        <Select
                          value={q.type}
                          onChange={(e) => updateQuestion(idx, { type: e.target.value })}
                          className="!py-1 !text-xs w-40"
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </Select>
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          Required
                        </label>
                      </div>
                      {(q.type === "SINGLE_CHOICE" || q.type === "MULTI_CHOICE") && (
                        <div className="space-y-1">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1">
                              <input
                                className="input !py-1 !text-xs flex-1"
                                value={opt}
                                onChange={(e) => updateOption(idx, oi, e.target.value)}
                                placeholder={`Option ${oi + 1}`}
                              />
                              <button onClick={() => removeOption(idx, oi)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addOption(idx)} className="text-[11px] text-brand-600 hover:underline">
                            + Add option
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeQuestion(idx)}
                      className="mt-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center">
                  <FileQuestion className="mx-auto mb-1 h-6 w-6 text-gray-300" />
                  <p className="text-xs text-gray-400">No questions added yet</p>
                  <button onClick={addQuestion} className="mt-1 text-xs text-brand-600 hover:underline">
                    Add your first question
                  </button>
                </div>
              )}
            </div>
          </div>

          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : editTarget ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Send Modal */}
      <Modal
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        title={`Send: ${sendTarget?.title ?? ""}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            The vendor contact gets a secure link and must confirm a code sent to their email before answering.
            Links expire after 30 days.
          </p>
          <Field label="Vendor">
            <Select
              value={sendVendorId}
              onChange={(e) => {
                setSendVendorId(e.target.value);
                setSendEmail(vendors.find((v) => v.id === e.target.value)?.contactEmail ?? "");
              }}
            >
              <option value="">Select a vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vendor contact email" htmlFor="send-email" hint="The questionnaire and verification codes go to this address.">
            <input id="send-email" type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="security@vendor.com" className="input" />
          </Field>
          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setSendTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSend} disabled={saving || !sendVendorId || !sendEmail.trim()} className="btn-primary">
              {saving ? "Sending..." : "Send questionnaire"}
            </button>
          </div>
        </div>
      </Modal>

      <IssuedLinkDialog issued={issued} onClose={() => { setIssued(null); startTransition(() => router.refresh()); }} />
      <ResponsesPanel
        questionnaire={responsesTarget}
        canWrite={canWrite}
        onClose={() => { setResponsesTarget(null); startTransition(() => router.refresh()); }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete questionnaire"
        message={`Delete "${deleteTarget?.title}"? All responses will also be deleted. This action cannot be undone.`}
      />
      <ImportQuestionsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        categories={Q_CATEGORIES}
        onCreated={(t, count) => {
          setImportOpen(false);
          toast.success(`Created "${t}" with ${count} questions as a draft.`);
          startTransition(() => router.refresh());
        }}
      />
      </>)}
    </div>
  );
}
