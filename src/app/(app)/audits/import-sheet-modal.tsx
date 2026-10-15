"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, Select, TextInput, FormError } from "@/components/form";

type PreviewRow = {
  row: number; code: string; title: string; criteria: string[];
  action: "create" | "update"; owner: string | null; frequency: string;
};
type Preview = {
  create: number; update: number;
  errors: { row: number; message: string }[];
  unknownOwners: string[]; newCriteria: string[]; notInSheet: string[];
  rows: PreviewRow[];
};

// Financial-year presets: calendar year, or April–March (common in India/UK).
function presets(now = new Date()) {
  const y = now.getFullYear();
  const fy = now.getMonth() >= 3 ? y : y - 1;
  return [
    { label: `FY ${fy}-${String(fy + 1).slice(2)} (Apr–Mar)`, name: `FY${fy}-${String(fy + 1).slice(2)}`, start: `${fy}-04-01`, end: `${fy + 1}-03-31` },
    { label: `${y} (Jan–Dec)`, name: `${y}`, start: `${y}-01-01`, end: `${y}-12-31` },
  ];
}

export function ImportSheetModal({
  open, onClose, frameworks, onImported,
}: {
  open: boolean;
  onClose: () => void;
  frameworks: { id: string; name: string }[];
  onImported: (periodId: string, created: number, updated: number) => void;
}) {
  const p = presets();
  const fwName = (id: string) => frameworks.find((f) => f.id === id)?.name ?? "";
  const initial = () => {
    const frameworkId = frameworks.find((f) => /soc/i.test(f.name))?.id ?? frameworks[0]?.id ?? "";
    return { frameworkId, name: `${fwName(frameworkId)} · ${p[0].name}`, startDate: p[0].start, endDate: p[0].end };
  };
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setForm(initial()); setFile(null); setPreview(null); setError(null); };
  const close = () => { reset(); onClose(); };

  const send = async (mode: "preview" | "import", f: File) => {
    const body = new FormData();
    body.set("file", f);
    body.set("mode", mode);
    Object.entries(form).forEach(([k, v]) => body.set(k, v));
    const res = await fetch("/api/audit-periods/import", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Something went wrong reading the sheet");
    return data;
  };

  const choose = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setError(null);
    if (!f) return;
    setBusy("preview");
    try {
      setPreview(await send("preview", f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      const r = await send("import", file);
      reset();
      onImported(r.periodId, r.created, r.updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Changing the period details after a preview means the preview no longer describes the import.
  const update = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); if (preview && patch.frameworkId) setPreview(null); };

  const stepCls = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900";

  return (
    <Modal open={open} onClose={close} title="Import controls from a sheet" size="lg">
      <div className="space-y-5">
        <FormError message={error} />

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={stepCls}>1</span> Audit period</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Framework" htmlFor="impFramework">
              <Select id="impFramework" value={form.frameworkId} onChange={(e) => {
                const frameworkId = e.target.value;
                const oldPrefix = `${fwName(form.frameworkId)} · `;
                update({ frameworkId, name: form.name.startsWith(oldPrefix) ? `${fwName(frameworkId)} · ${form.name.slice(oldPrefix.length)}` : form.name });
              }}>
                {frameworks.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Audit period name" htmlFor="impName">
              <TextInput id="impName" value={form.name} onChange={(e) => update({ name: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Start date" htmlFor="impStart">
              <input id="impStart" type="date" className="input" value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} />
            </Field>
            <Field label="End date" htmlFor="impEnd">
              <input id="impEnd" type="date" className="input" value={form.endDate} onChange={(e) => update({ endDate: e.target.value })} />
            </Field>
            <div className="flex gap-1.5 pb-1">
              {p.map((x) => (
                <button key={x.label} type="button" onClick={() => update({ startDate: x.start, endDate: x.end, name: `${fwName(form.frameworkId)} · ${x.name}` })}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={stepCls}>2</span> Download the control sheet and fill it in</h3>
          <p className="text-xs text-gray-500">
            The template lists the controls already mapped to {fwName(form.frameworkId) || "this framework"}, with dropdowns for frequency and status,
            the valid criteria IDs, and instructions. Share it with your team, then upload the completed file below.
          </p>
          <a
            href={`/api/audit-periods/import/template?frameworkId=${encodeURIComponent(form.frameworkId)}`}
            className="btn-secondary inline-flex items-center gap-2"
            download
          >
            <Download className="h-4 w-4" /> Download template (.xlsx)
          </a>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={stepCls}>3</span> Upload the completed sheet</h3>
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

        {preview && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={stepCls}>4</span> Check and import</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700 dark:bg-green-950 dark:text-green-300">{preview.create} new control{preview.create === 1 ? "" : "s"}</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">{preview.update} to update</span>
              {preview.errors.length > 0 && (
                <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} with problems</span>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                <p className="mb-1 flex items-center gap-1.5 font-medium"><XCircle className="h-4 w-4" /> Fix these rows in the sheet and upload it again:</p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                  {preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                </ul>
              </div>
            )}

            {(preview.unknownOwners.length > 0 || preview.newCriteria.length > 0 || preview.notInSheet.length > 0) && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="flex items-center gap-1.5 text-sm font-medium"><AlertTriangle className="h-4 w-4" /> Please check</p>
                {preview.unknownOwners.length > 0 && (
                  <p>These owner emails aren&apos;t users, so those controls keep their current owner (or stay unassigned): {preview.unknownOwners.join(", ")}</p>
                )}
                {preview.newCriteria.length > 0 && (
                  <p>These criteria aren&apos;t in {fwName(form.frameworkId)} yet and will be added: {preview.newCriteria.join(", ")}</p>
                )}
                {preview.notInSheet.length > 0 && (
                  <p>{preview.notInSheet.length} control{preview.notInSheet.length === 1 ? " is" : "s are"} mapped to {fwName(form.frameworkId)} but not in the sheet; {preview.notInSheet.length === 1 ? "it stays" : "they stay"} in scope: {preview.notInSheet.slice(0, 10).join(", ")}{preview.notInSheet.length > 10 ? "…" : ""}</p>
                )}
              </div>
            )}

            {preview.rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-500 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">Control</th>
                      <th className="px-3 py-2 font-medium">Criteria</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Frequency</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.rows.map((r) => (
                      <tr key={r.row}>
                        <td className="px-3 py-1.5"><span className="mr-1.5 font-mono text-gray-500">{r.code}</span>{r.title}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-600">{r.criteria.join(", ")}</td>
                        <td className={`px-3 py-1.5 ${r.owner?.endsWith("(not a user)") ? "text-amber-700" : ""}`}>{r.owner ?? "—"}</td>
                        <td className="px-3 py-1.5">{r.frequency}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.action === "create" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                            {r.action === "create" ? "New" : "Update"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          {preview && preview.errors.length === 0 && (
            <p className="mr-auto flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 className="h-4 w-4" /> Sheet looks good</p>
          )}
          <button type="button" onClick={close} className="btn-secondary">Cancel</button>
          <button
            type="button"
            onClick={doImport}
            disabled={!preview || preview.errors.length > 0 || busy !== null || !form.name.trim()}
            className="btn-primary"
          >
            {busy === "import" ? "Importing…" : `Import ${preview ? preview.create + preview.update : ""} controls & create period`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
