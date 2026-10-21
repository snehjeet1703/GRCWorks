"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Lock, Mail, Paperclip, Send, ShieldCheck, Trash2, Upload,
} from "lucide-react";

type Question = {
  id: string; text: string; type: string; required: boolean; options: string[]; category?: string;
};
type Answer = { questionId: string; value: string | string[] | number | boolean };
type FileMeta = { id: string; questionId: string; fileName: string; fileSize: number };
type PortalData = {
  organizationName: string; vendorName: string; title: string; maskedEmail: string; logoVersion: number | null;
  status: string; expiresAt: string; verified: boolean;
  description?: string; questions?: Question[]; answers?: Answer[]; files?: FileMeta[];
  reviewNotes?: string; submittedAt?: string | null;
};

const EDITABLE = new Set(["NOT_STARTED", "IN_PROGRESS"]);

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "Something went wrong"), { status: res.status, details: body.details });
  return body;
}

export function VendorPortal({ token, accept }: { token: string; accept: string }) {
  const api = `/api/vendor-portal/${encodeURIComponent(token)}`;
  const [data, setData] = useState<PortalData | null>(null);
  const [fatal, setFatal] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await call(api));
    } catch (e: any) {
      setFatal(e.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  if (fatal) {
    return (
      <Shell>
        <div className="card text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold">Link unavailable</h1>
          <p className="mt-1 text-sm text-gray-600">{fatal}. Ask the person who sent it for a new link.</p>
        </div>
      </Shell>
    );
  }
  if (!data) return <Shell><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /></Shell>;
  if (!data.verified) return <Verify api={api} data={data} onVerified={load} />;
  return <Questionnaire api={api} data={data} accept={accept} onChange={load} />;
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="px-4 py-10 sm:py-16">
      <div className={`mx-auto ${wide ? "max-w-3xl" : "max-w-md"}`}>{children}</div>
      <p className="mt-10 text-center text-xs text-gray-400">
        <Lock className="mr-1 inline h-3 w-3" /> Secure vendor portal · GRCWorks
      </p>
    </div>
  );
}

function Verify({ api, data, onVerified }: { api: string; data: PortalData; onVerified: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setBusy(true); setError("");
    try { await call(`${api}/otp/send`, { method: "POST" }); setSent(true); }
    catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await call(`${api}/otp/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      onVerified();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  return (
    <Shell>
      <div className="mb-6 text-center">
        {data.logoVersion ? (
          <img src={`${api}/logo?v=${data.logoVersion}`} alt={`${data.organizationName} logo`} className="mx-auto h-11 max-w-[12rem] object-contain" />
        ) : (
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
        )}
        <h1 className="mt-4 text-xl font-semibold">{data.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          <strong>{data.organizationName}</strong> has asked <strong>{data.vendorName}</strong> to complete this questionnaire.
        </p>
      </div>
      <div className="card space-y-4">
        {!sent ? (
          <>
            <p className="text-sm text-gray-600">To protect your answers, we&apos;ll send a verification code to <strong>{data.maskedEmail}</strong>.</p>
            <button onClick={send} disabled={busy} className="btn-primary w-full">
              <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Send verification code"}
            </button>
          </>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-gray-600">Enter the 6-digit code sent to <strong>{data.maskedEmail}</strong>. It expires in 10 minutes.</p>
            <input
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Verification code" placeholder="000000"
              className="input text-center font-mono text-lg tracking-[0.5em]"
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
              {busy ? "Verifying…" : "Continue"}
            </button>
            <button type="button" onClick={send} disabled={busy} className="w-full text-xs text-gray-500 hover:text-gray-800">
              Didn&apos;t get it? Send a new code
            </button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
    </Shell>
  );
}

function Questionnaire({ api, data, accept, onChange }: { api: string; data: PortalData; accept: string; onChange: () => void }) {
  const questions = data.questions ?? [];
  const editable = EDITABLE.has(data.status);
  const [answers, setAnswers] = useState<Record<string, Answer["value"]>>(
    () => Object.fromEntries((data.answers ?? []).map((a) => [a.questionId, a.value]))
  );
  const [files, setFiles] = useState<FileMeta[]>(data.files ?? []);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!editable);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toPayload = useCallback(
    (a: typeof answers) => Object.entries(a).filter(([, v]) => v !== "" && v !== undefined).map(([questionId, value]) => ({ questionId, value })),
    []
  );

  const save = useCallback(async (a: typeof answers) => {
    setSaveState("saving");
    try {
      await call(`${api}/answers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: toPayload(a) }) });
      setSaveState("saved");
    } catch (e: any) {
      setSaveState("error");
      setError(e.message);
    }
  }, [api, toPayload]);

  // Build from a ref, not the render's closure, so rapid consecutive edits don't drop each other.
  const latest = useRef(answers);
  const setAnswer = (id: string, value: Answer["value"]) => {
    const next = { ...latest.current, [id]: value };
    latest.current = next;
    setAnswers(next);
    setMissing((m) => { const n = new Set(m); n.delete(id); return n; });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 800);
  };

  const upload = async (questionId: string, file: File) => {
    setError("");
    const form = new FormData();
    form.append("questionId", questionId);
    form.append("file", file);
    try {
      const created = await call(`${api}/files`, { method: "POST", body: form });
      setFiles((f) => [...f, created]);
      setMissing((m) => { const n = new Set(m); n.delete(questionId); return n; });
    } catch (e: any) { setError(`${file.name}: ${e.message}`); }
  };

  const removeFile = async (id: string) => {
    try { await call(`${api}/files/${id}`, { method: "DELETE" }); setFiles((f) => f.filter((x) => x.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const submit = async () => {
    if (!confirm("Submit your answers? You won't be able to change them afterwards.")) return;
    clearTimeout(timer.current);
    setSubmitting(true); setError("");
    try {
      await call(`${api}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: toPayload(latest.current) }) });
      setSubmitted(true);
      onChange();
    } catch (e: any) {
      const ids: string[] = e.details?.missingQuestionIds ?? [];
      setMissing(new Set(ids));
      setError(e.message);
      if (ids[0]) document.getElementById(`q-${ids[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setSubmitting(false);
  };

  const fileQs = useMemo(() => new Set(files.map((f) => f.questionId)), [files]);
  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    return (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) || fileQs.has(q.id);
  }).length;

  const groups = useMemo(() => {
    const m = new Map<string, Question[]>();
    for (const q of questions) {
      const key = q.category?.trim() || "General";
      m.set(key, [...(m.get(key) ?? []), q]);
    }
    return [...m.entries()];
  }, [questions]);

  if (submitted) {
    return (
      <Shell>
        <div className="card text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h1 className="mt-3 text-lg font-semibold">Thank you, your answers were submitted</h1>
          <p className="mt-1 text-sm text-gray-600">
            {data.organizationName} will review your response to “{data.title}”. They&apos;ll contact you if anything else is needed.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <header className="mb-6">
        {data.logoVersion && (
          <img src={`${api}/logo?v=${data.logoVersion}`} alt={`${data.organizationName} logo`} className="mb-3 h-9 max-w-[12rem] object-contain" />
        )}
        <p className="text-sm text-gray-500">{data.organizationName} · for {data.vendorName}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{data.title}</h1>
        {data.description && <p className="mt-2 text-sm text-gray-600">{data.description}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-gray-600">{answeredCount} of {questions.length} answered</span>
          <span className="text-xs text-gray-400" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? "Not saved" : ""}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-gray-900 transition-all" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
        </div>
      </header>

      {data.reviewNotes && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Changes requested:</strong> {data.reviewNotes}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([category, qs]) => (
          <section key={category} className="card space-y-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{category.replace(/_/g, " ")}</h2>
            {qs.map((q) => (
              <div key={q.id} id={`q-${q.id}`} className={missing.has(q.id) ? "-m-3 rounded-lg p-3 ring-2 ring-red-300" : ""}>
                <p className="text-sm font-medium">
                  {q.text} {q.required && <span className="text-red-500" aria-label="required">*</span>}
                </p>
                <div className="mt-2">
                  <AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
                </div>
                <Attachments
                  q={q}
                  files={files.filter((f) => f.questionId === q.id)}
                  accept={accept}
                  onUpload={(f) => upload(q.id, f)}
                  onRemove={removeFile}
                />
                {missing.has(q.id) && <p className="mt-1 text-xs text-red-600">This question is required.</p>}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="sticky bottom-4 mt-8 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-red-600" role="alert">{error}</p>
        <button onClick={submit} disabled={submitting} className="btn-primary shrink-0">
          <Send className="h-4 w-4" /> {submitting ? "Submitting…" : "Submit answers"}
        </button>
      </div>
    </Shell>
  );
}

function AnswerInput({ q, value, onChange }: { q: Question; value: Answer["value"] | undefined; onChange: (v: Answer["value"]) => void }) {
  const id = `a-${q.id}`;
  switch (q.type) {
    case "TEXT":
      return <textarea id={id} aria-label={q.text} rows={3} maxLength={5000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="input" />;
    case "YES_NO":
    case "SINGLE_CHOICE": {
      const opts = q.type === "YES_NO" ? ["Yes", "No"] : q.options;
      return (
        <div role="radiogroup" aria-label={q.text} className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${value === o ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:bg-gray-50"}`}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    case "MULTI_CHOICE": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => {
            const on = selected.includes(o);
            return (
              <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${on ? "border-gray-900 bg-gray-50" : "border-gray-300"}`}>
                <input type="checkbox" checked={on} onChange={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])} />
                {o}
              </label>
            );
          })}
        </div>
      );
    }
    case "RATING":
      return (
        <div role="radiogroup" aria-label={q.text} className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)}
              className={`h-9 w-9 rounded-md border text-sm font-medium ${value === n ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 hover:bg-gray-50"}`}>
              {n}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function Attachments({ q, files, accept, onUpload, onRemove }: {
  q: Question; files: FileMeta[]; accept: string; onUpload: (f: File) => void; onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isFileQuestion = q.type === "FILE_UPLOAD";
  return (
    <div className="mt-2 space-y-1.5">
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="flex-1 truncate">{f.fileName}</span>
          <span className="text-gray-400">{(f.fileSize / 1024).toFixed(0)} KB</span>
          <button onClick={() => onRemove(f.id)} aria-label={`Remove ${f.fileName}`} className="text-gray-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <label className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium ${isFileQuestion ? "rounded-md border border-dashed border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50" : "text-gray-500 hover:text-gray-800"}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isFileQuestion ? <Upload className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
        {isFileQuestion ? "Upload file" : "Attach supporting evidence"}
        <input
          type="file" accept={accept} className="sr-only" disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            await onUpload(f);
            setBusy(false);
          }}
        />
      </label>
    </div>
  );
}
