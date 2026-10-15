"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, Select, TextArea, TextInput, FormError } from "@/components/form";

export type ImportedQuestion = { id: string; text: string; type: string; required: boolean; options: string[]; category: string };
export type SheetResult = {
  questions: ImportedQuestion[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
};

const TYPE_LABEL: Record<string, string> = {
  TEXT: "Free text", YES_NO: "Yes / No", SINGLE_CHOICE: "Single choice",
  MULTI_CHOICE: "Multiple choice", RATING: "Rating (1-5)", FILE_UPLOAD: "File upload",
};
const humanize = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Sends a sheet to the import endpoint. Used by the dialog and by the editor's "Import from sheet". */
export async function readQuestionSheet(file: File, extra: Record<string, string> = {}) {
  const body = new FormData();
  body.set("file", file);
  Object.entries(extra).forEach(([k, v]) => body.set(k, v));
  const res = await fetch("/api/vendors/questionnaires/import", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Something went wrong reading the sheet");
  return data;
}

export function SheetIssues({ result }: { result: SheetResult }) {
  return (
    <>
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <p className="mb-1 flex items-center gap-1.5 font-medium"><XCircle className="h-4 w-4" /> Fix these rows in the sheet and upload it again:</p>
          <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
            {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium"><AlertTriangle className="h-4 w-4" /> Please check</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {result.warnings.map((w, i) => <li key={i}>Row {w.row}: {w.message}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

export function ImportQuestionsModal({
  open, onClose, categories, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: readonly string[];
  onCreated: (title: string, count: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SheetResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setTitle(""); setDescription(""); setCategory("GENERAL"); setFile(null); setResult(null); setError(null); };
  const close = () => { reset(); onClose(); };

  const choose = async (f: File | null) => {
    setFile(f); setResult(null); setError(null);
    if (!f) return;
    if (!title.trim()) setTitle(f.name.replace(/\.(xlsx|csv)$/i, "").replace(/[_-]+/g, " ").replace(/\s*questions?$/i, "").trim());
    setBusy("preview");
    try { setResult(await readQuestionSheet(f)); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const create = async () => {
    if (!file) return;
    setBusy("create"); setError(null);
    try {
      await readQuestionSheet(file, { mode: "create", title: title.trim(), description, category });
      const count = result?.questions.length ?? 0;
      reset();
      onCreated(title.trim(), count);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const step = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900";
  const bySection = result
    ? result.questions.reduce<Record<string, ImportedQuestion[]>>((acc, q) => { (acc[q.category || "GENERAL"] ??= []).push(q); return acc; }, {})
    : {};

  return (
    <Modal open={open} onClose={close} title="Import questionnaire from a sheet" size="lg">
      <div className="space-y-5">
        <FormError message={error} />

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={step}>1</span> Download the question sheet and fill it in</h3>
          <p className="text-xs text-gray-500">
            The template has example questions, dropdowns for answer type and required, and instructions. Share it with whoever writes
            the questions, then upload the completed file.
          </p>
          <a href="/api/vendors/questionnaires/template" className="btn-secondary inline-flex items-center gap-2" download>
            <Download className="h-4 w-4" /> Download template (.xlsx)
          </a>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={step}>2</span> Upload the completed sheet</h3>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] ?? null); }}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-center hover:border-brand-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            {file ? <FileSpreadsheet className="h-7 w-7 text-green-600" /> : <Upload className="h-7 w-7 text-gray-400" />}
            <p className="text-sm font-medium">{file ? file.name : "Drop the sheet here or click to choose"}</p>
            <p className="text-xs text-gray-500">{busy === "preview" ? "Checking the sheet…" : file ? "Click to choose a different file" : ".xlsx or .csv, up to 5 MB"}</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
          </div>
        </section>

        {result && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={step}>3</span> Check and create</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Questionnaire title" htmlFor="iqTitle">
                <TextInput id="iqTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Annual vendor security review 2026" />
              </Field>
              <Field label="Category" htmlFor="iqCategory">
                <Select id="iqCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description (optional)" htmlFor="iqDesc">
              <TextArea id="iqDesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                {result.questions.length} question{result.questions.length === 1 ? "" : "s"} in {Object.keys(bySection).length} section{Object.keys(bySection).length === 1 ? "" : "s"}
              </span>
              {result.errors.length > 0 && (
                <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{result.errors.length} row{result.errors.length === 1 ? "" : "s"} with problems</span>
              )}
            </div>
            <SheetIssues result={result} />

            {result.questions.length > 0 && (
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                {Object.entries(bySection).map(([section, qs]) => (
                  <div key={section}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{humanize(section)}</p>
                    <ol className="space-y-1">
                      {qs.map((q) => (
                        <li key={q.id} className="text-xs">
                          <span className="text-gray-900 dark:text-gray-100">{q.text}</span>
                          {q.required && <span className="text-red-500"> *</span>}
                          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{TYPE_LABEL[q.type] ?? q.type}</span>
                          {q.options.length > 0 && <span className="ml-1.5 text-gray-500">{q.options.join(" · ")}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          {result && result.errors.length === 0 && (
            <p className="mr-auto flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 className="h-4 w-4" /> Sheet looks good. It&apos;s saved as a draft you can edit.</p>
          )}
          <button type="button" onClick={close} className="btn-secondary">Cancel</button>
          <button
            type="button"
            onClick={create}
            disabled={!result || result.errors.length > 0 || result.questions.length === 0 || !title.trim() || busy !== null}
            className="btn-primary"
          >
            {busy === "create" ? "Creating…" : "Create questionnaire"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
