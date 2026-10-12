"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, Link2, Paperclip, RotateCcw, Send, ShieldOff } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";

type Question = { id: string; text: string; type: string; required: boolean; options: string[]; category?: string };
type FileMeta = { id: string; questionId: string; fileName: string; fileSize: number };
type ResponseRow = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "REVIEWED";
  contactEmail: string;
  answers: { questionId: string; value: unknown }[];
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string;
  score: number | null;
  inviteExpiresAt: string | null;
  linkActive: boolean;
  vendor: { id: string; name: string };
  files: FileMeta[];
};

const STATUS_STYLE: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  SUBMITTED: "bg-amber-50 text-amber-700",
  REVIEWED: "bg-green-50 text-green-700",
};

function label(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

function formatValue(v: unknown) {
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function ResponsesPanel({
  questionnaire, canWrite, onClose,
}: { questionnaire: { id: string; title: string } | null; canWrite: boolean; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ link: string; email: string; emailSent: boolean } | null>(null);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const base = questionnaire ? `/api/vendors/questionnaires/${questionnaire.id}/responses` : "";

  const load = useCallback(async () => {
    if (!base) return;
    const res = await fetch(base);
    if (!res.ok) { toast.error("Failed to load responses"); return; }
    const data = await res.json();
    setRows(data.responses);
    setQuestions(Array.isArray(data.questionnaire.questions) ? data.questionnaire.questions : []);
  }, [base, toast]);

  useEffect(() => {
    setRows(null); setSelectedId(null);
    load();
  }, [load]);

  const selected = rows?.find((r) => r.id === selectedId) ?? null;
  useEffect(() => {
    setScore(selected?.score != null ? String(selected.score) : "");
    setNotes("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (r: ResponseRow, action: "resend" | "reopen" | "revoke") => {
    if (action === "revoke" && !confirm(`Revoke ${r.vendor.name}'s link? They will no longer be able to open the questionnaire.`)) return;
    if (action === "reopen" && !notes.trim()) { toast.error("Explain what needs changing in the notes"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${base}/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "reopen" ? { notes } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (data.inviteLink) setIssued({ link: data.inviteLink, email: r.contactEmail, emailSent: data.emailSent });
      else toast.success("Link revoked");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const review = async (r: ResponseRow) => {
    const n = Number(score);
    if (score !== "" && (!Number.isInteger(n) || n < 0 || n > 100)) { toast.error("Score must be 0–100"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${base}/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNotes: notes, ...(score !== "" ? { score: n } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Review failed");
      toast.success("Response marked as reviewed");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <Modal open={!!questionnaire} onClose={onClose} title={selected ? `${selected.vendor.name}: ${questionnaire?.title}` : `Responses: ${questionnaire?.title ?? ""}`} size="lg">
        {!rows ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : selected ? (
          <div className="space-y-5">
            <button onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-3.5 w-3.5" /> All responses
            </button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[selected.status]}`}>{label(selected.status)}</span>
              <span>{selected.contactEmail}</span>
              {selected.submittedAt && <span>· submitted {new Date(selected.submittedAt).toLocaleDateString()}</span>}
              {selected.score != null && <span>· score {selected.score}/100</span>}
            </div>

            <ol className="space-y-4">
              {questions.map((q, i) => {
                const value = formatValue(selected.answers.find((a) => a.questionId === q.id)?.value);
                const files = selected.files.filter((f) => f.questionId === q.id);
                return (
                  <li key={q.id} className="border-b border-gray-100 pb-3">
                    <p className="text-sm font-medium text-gray-900">{i + 1}. {q.text}</p>
                    <p className={`mt-1 whitespace-pre-wrap text-sm ${value ? "text-gray-700" : "italic text-gray-400"}`}>{value ?? (files.length ? "" : "No answer")}</p>
                    {files.map((f) => (
                      <a key={f.id} href={`${base}/${selected.id}/files/${f.id}`} className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> {f.fileName} ({(f.fileSize / 1024).toFixed(0)} KB) <Download className="h-3 w-3" />
                      </a>
                    ))}
                  </li>
                );
              })}
            </ol>

            {canWrite && (
              <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium">Review</p>
                {selected.status === "SUBMITTED" && (
                  <div>
                    <label htmlFor="rv-score" className="mb-1 block text-xs text-gray-500">Score (0–100, optional)</label>
                    <input id="rv-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ""))} className="input w-32" />
                  </div>
                )}
                <div>
                  <label htmlFor="rv-notes" className="mb-1 block text-xs text-gray-500">
                    Notes {["SUBMITTED", "REVIEWED"].includes(selected.status) ? "(shown to the vendor if you send it back)" : ""}
                  </label>
                  <textarea id="rv-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {selected.linkActive && (
                    <button onClick={() => act(selected, "revoke")} disabled={busy} className="btn-ghost btn-sm text-red-600">
                      <ShieldOff className="h-4 w-4" /> Revoke link
                    </button>
                  )}
                  {["NOT_STARTED", "IN_PROGRESS"].includes(selected.status) && (
                    <button onClick={() => act(selected, "resend")} disabled={busy} className="btn-secondary btn-sm">
                      <Send className="h-4 w-4" /> Resend link
                    </button>
                  )}
                  {["SUBMITTED", "REVIEWED"].includes(selected.status) && (
                    <button onClick={() => act(selected, "reopen")} disabled={busy} className="btn-secondary btn-sm">
                      <RotateCcw className="h-4 w-4" /> Send back for changes
                    </button>
                  )}
                  {selected.status === "SUBMITTED" && (
                    <button onClick={() => review(selected)} disabled={busy} className="btn-primary btn-sm">Mark reviewed</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Not sent to any vendor yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSelectedId(r.id)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{r.vendor.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {r.contactEmail || "No contact"}
                      {r.linkActive && r.inviteExpiresAt && <> · link expires {new Date(r.inviteExpiresAt).toLocaleDateString()}</>}
                      {!r.linkActive && ["NOT_STARTED", "IN_PROGRESS"].includes(r.status) && <> · <span className="text-red-600">link inactive</span></>}
                    </p>
                  </div>
                  {r.files.length > 0 && <span className="text-xs text-gray-400"><Paperclip className="inline h-3 w-3" /> {r.files.length}</span>}
                  {r.score != null && <span className="text-xs text-gray-500">{r.score}/100</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>{label(r.status)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <IssuedLinkDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

export function IssuedLinkDialog({
  issued, onClose,
}: { issued: { link: string; email: string; emailSent: boolean } | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal open={!!issued} onClose={onClose} title="Vendor link">
      {issued && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {issued.emailSent ? (
              <>An invitation was emailed to <strong>{issued.email}</strong>.</>
            ) : (
              <>Email couldn&apos;t be sent (check SMTP settings). Share this link with <strong>{issued.email}</strong> yourself.</>
            )}{" "}
            The vendor must confirm a code sent to that address before seeing the questionnaire. This link is shown only once.
          </p>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
            <input readOnly value={issued.link} onFocus={(e) => e.target.select()} aria-label="Vendor link" className="input font-mono text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary">Done</button>
            <button onClick={() => { navigator.clipboard.writeText(issued.link); toast.success("Link copied"); }} className="btn-primary">
              <Copy className="h-4 w-4" /> Copy link
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
