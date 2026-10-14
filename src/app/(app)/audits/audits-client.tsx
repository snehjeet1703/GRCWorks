"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, Plus, ArrowRight } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, Select, TextInput, FormError } from "@/components/form";
import { FrameworkBadge } from "@/components/framework-badge";
import { useToast } from "@/components/toast";

export type Counts = {
  total: number; approved: number; inReview: number; ready: number; changesRequested: number;
  due: number; overdue: number; upcoming: number;
};
export type PeriodSummary = {
  id: string; name: string; startDate: string; endDate: string; approvalRequired: boolean;
  framework: { id: string; name: string };
  counts: Counts; controlCount: number;
};

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function ProgressBar({ counts }: { counts: Counts }) {
  const t = Math.max(counts.total, 1);
  const parts = [
    { n: counts.approved, cls: "bg-green-500", label: "approved" },
    { n: counts.inReview + counts.ready, cls: "bg-purple-400", label: "uploaded / in review" },
    { n: counts.changesRequested, cls: "bg-amber-400", label: "changes requested" },
    { n: counts.overdue, cls: "bg-red-500", label: "missing" },
    { n: counts.due, cls: "bg-blue-300", label: "due now" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="img"
      aria-label={parts.map((p) => `${p.n} ${p.label}`).join(", ") + `, ${counts.upcoming} not started`}>
      {parts.map((p) => p.n > 0 && <div key={p.label} className={p.cls} style={{ width: `${(p.n / t) * 100}%` }} />)}
    </div>
  );
}

function periodState(p: PeriodSummary) {
  const now = Date.now();
  if (now < Date.parse(p.startDate)) return { label: "Upcoming", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  if (now > Date.parse(p.endDate)) return { label: "Closed", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  return { label: "In progress", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" };
}

export function AuditsClient({
  periods, frameworks, canManage,
}: {
  periods: PeriodSummary[];
  frameworks: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ name: "", frameworkId: "", startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/audit-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setError(b?.error ?? "Couldn't create the audit period");
    setOpen(false);
    toast.success(`Created ${b.name}.`);
    startTransition(() => router.push(`/audits/${b.id}`));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audits</h1>
          <p className="mt-1 text-sm text-gray-500">
            Audit periods collect evidence for every control through the year, ready to hand to your auditors.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => {
            setForm({ name: "", frameworkId: frameworks[0]?.id ?? "", startDate: `${year}-01-01`, endDate: `${year}-12-31` });
            setError(null);
            setOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" /> New audit period
          </button>
        )}
      </div>

      {periods.length === 0 ? (
        <div className="card flex flex-col items-center py-14 text-center text-gray-500">
          <CalendarRange className="mb-3 h-9 w-9 text-gray-300" />
          <p className="font-medium text-gray-700 dark:text-gray-300">No audit periods yet</p>
          <p className="mt-1 max-w-md text-sm">
            Create one for each audit, for example &ldquo;SOC 2 Type II · FY{year}&rdquo;, 1 Jan – 31 Dec. Control owners then
            see each period&apos;s evidence in their tasks.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {periods.map((p) => {
            const st = periodState(p);
            const c = p.counts;
            const pct = c.total ? Math.round((c.approved / c.total) * 100) : 0;
            return (
              <Link key={p.id} href={`/audits/${p.id}`} className="card group block transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <FrameworkBadge name={p.framework.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold">{p.name}</h2>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">{p.framework.name} · {fmtDay(p.startDate)} – {fmtDay(p.endDate)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-600" />
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-baseline justify-between text-xs text-gray-500">
                    <span><span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{pct}%</span> of evidence approved</span>
                    <span>{p.controlCount} controls · {c.total} evidence periods</span>
                  </div>
                  <ProgressBar counts={c} />
                  <p className="mt-2 text-xs text-gray-500">
                    {c.approved} approved · {c.inReview + c.ready} uploaded or in review
                    {c.overdue > 0 && <> · <span className="font-medium text-red-600">{c.overdue} missing</span></>}
                    {c.due > 0 && <> · {c.due} due now</>}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New audit period" size="md">
        <form onSubmit={create} className="space-y-4">
          <FormError message={error} />
          <Field label="Name" htmlFor="apName">
            <TextInput id="apName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={`SOC 2 Type II · FY${year}`} required autoFocus />
          </Field>
          <Field label="Framework" htmlFor="apFramework" hint="Controls mapped to this framework are in scope.">
            <Select id="apFramework" value={form.frameworkId} onChange={(e) => setForm({ ...form, frameworkId: e.target.value })} required>
              <option value="" disabled>Choose a framework</option>
              {frameworks.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" htmlFor="apStart">
              <input id="apStart" type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </Field>
            <Field label="End date" htmlFor="apEnd">
              <input id="apEnd" type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
            </Field>
          </div>
          <p className="text-xs text-gray-500">
            Each control&apos;s evidence frequency (monthly, quarterly, annually…) splits the period into evidence slots. You can set
            frequencies in bulk on the next screen.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Creating…" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
