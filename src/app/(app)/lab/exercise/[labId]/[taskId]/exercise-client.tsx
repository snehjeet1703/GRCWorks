"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, Lightbulb, XCircle } from "lucide-react";
import type { Exercise, Table } from "@/lib/lab/exercises";

type KeyRow = { row: string; label: string; explain: string };
type Result = {
  passed: boolean; planted: number; found: number; wrongReason: number; falseAlarms: number;
  missedByType: { label: string; count: number }[]; key: KeyRow[] | null;
};

// Spreadsheet-safe CSV: quotes every cell and neutralises formulas.
function toCsv(t: Table) {
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  return [t.columns.map((c) => cell(c.label)).join(","), ...t.rows.map((r) => t.columns.map((c) => cell(r[c.key] ?? "")).join(","))].join("\r\n");
}

function download(t: Table) {
  const url = URL.createObjectURL(new Blob([toCsv(t)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DataTable({ table, extra }: { table: Table; extra?: (row: Record<string, string>) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-left text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          <tr>
            {table.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-2 py-2 font-medium">{c.label}</th>)}
            {extra && <th className="px-2 py-2 font-medium">Your finding</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {table.rows.map((r, i) => (
            <tr key={r.id ?? i} className="align-top">
              {table.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-2 py-1.5">{r[c.key] || <span className="text-gray-300">—</span>}</td>)}
              {extra && <td className="px-2 py-1">{extra(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExerciseClient({
  labId, taskId, labTitle, task, exercise, savedFlags, answerKey,
}: {
  labId: string;
  taskId: string;
  labTitle: string;
  task: { title: string; instructions: string; hints: string[] };
  exercise: Omit<Exercise, "answers">;
  savedFlags: Record<string, string>;
  answerKey: KeyRow[] | null;
}) {
  const [flags, setFlags] = useState<Record<string, string>>(savedFlags);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showHints, setShowHints] = useState(false);
  const key = result?.key ?? answerKey;
  const keyByRow = useMemo(() => new Map((key ?? []).map((k) => [k.row, k])), [key]);
  const flagged = Object.values(flags).filter((v) => v && v !== "OK").length;

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/lab/exercise", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labId, taskId, flags }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => null);
    if (!res.ok) return setError(data?.error ?? "Couldn't check your answers");
    setResult(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>
      <Link href="/lab" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to labs
      </Link>
      <p className="text-xs font-medium text-gray-500">{labTitle}</p>
      <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">{task.instructions}</p>

      <ul className="mt-3 max-w-3xl list-disc space-y-0.5 pl-5 text-sm text-gray-600 dark:text-gray-300">
        {exercise.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      {task.hints.length > 0 && (
        showHints
          ? <ul className="mt-3 max-w-3xl space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{task.hints.map((h) => <li key={h}>{h}</li>)}</ul>
          : <button className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline" onClick={() => setShowHints(true)}><Lightbulb className="h-3 w-3" /> Show hints</button>
      )}

      {result && (
        <div className={`mt-5 rounded-lg border p-4 text-sm ${result.passed ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"}`}>
          <p className="flex items-center gap-2 font-medium">
            {result.passed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
            {result.passed
              ? `Passed: you found all ${result.planted} problems.`
              : `You found ${result.found} of ${result.planted} problems. Keep going.`}
          </p>
          {!result.passed && result.missedByType.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.missedByType.map((m) => <li key={m.label}>Still missing: {m.count} × {m.label}</li>)}
            </ul>
          )}
          {result.wrongReason > 0 && <p className="mt-1">{result.wrongReason} row(s) are problems, but you picked the wrong reason.</p>}
          {result.falseAlarms > 0 && (
            <p className="mt-1">{result.falseAlarms} row(s) you flagged are actually fine{result.falseAlarms > 2 ? "; at most two false alarms are allowed" : ""}.</p>
          )}
          {result.passed && <p className="mt-2">Next: raise the finding on the Findings page (the next task in this lab). The answer key is shown in the table below.</p>}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{exercise.table.title} <span className="text-sm font-normal text-gray-500">as of {exercise.asOf}</span></h2>
        <button className="btn-secondary" onClick={() => download(exercise.table)}><Download className="mr-2 h-4 w-4" /> Download CSV</button>
      </div>
      <div className="mt-2">
        <DataTable
          table={exercise.table}
          extra={(row) => {
            const k = keyByRow.get(row.id);
            return (
              <div className="min-w-[13rem]">
                <select
                  className="input py-1 text-xs"
                  value={flags[row.id] ?? "OK"}
                  onChange={(e) => setFlags((f) => ({ ...f, [row.id]: e.target.value }))}
                  aria-label={`Finding for row ${row.id}`}
                >
                  {exercise.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {key && (k
                  ? <p className="mt-1 text-[11px] text-green-700 dark:text-green-400"><strong>{k.label}:</strong> {k.explain}</p>
                  : (flags[row.id] ?? "OK") !== "OK" && <p className="mt-1 text-[11px] text-gray-500">No issue on this row.</p>)}
              </div>
            );
          }}
        />
      </div>

      {exercise.reference && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{exercise.reference.title}</h2>
            <button className="btn-secondary" onClick={() => download(exercise.reference!)}><Download className="mr-2 h-4 w-4" /> Download CSV</button>
          </div>
          <div className="mt-2"><DataTable table={exercise.reference} /></div>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-gray-200 bg-background py-3 dark:border-gray-800">
        <span className="text-sm text-gray-500">{flagged} row(s) flagged</span>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? "Checking..." : "Check my review"}</button>
        </div>
      </div>
    </div>
  );
}
