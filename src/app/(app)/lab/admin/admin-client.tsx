"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Plus, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { Modal } from "@/components/modal";
import { LAB_LEVELS } from "@/lib/lab/levels";
import type { LabSettingsView } from "@/lib/lab/access";

type CodeRow = {
  id: string; code: string; plan: string; months: number; seats: number; used: number; buyer: string; managerEmail: string;
  note: string; disabled: boolean; createdAt: string; redeemBy: string | null; redeemedBy: string[];
};
type LearnerRow = {
  name: string; email: string; joined: string; blocked: boolean; plan: string; expiresAt: string | null; industry: string;
  company: string; level: string; tasksDone: number; certificates: number;
};
type RequestRow = {
  id: string; name: string; email: string; plan: string; reference: string; amount: string; note: string; status: string;
  createdAt: string; decidedBy: string | null; decidedAt: string | null; decisionNote: string; currentAccess: string | null;
};
type Overview = {
  learners: number; paid: number; signups7: number; signups30: number; pending: number; certificates: number;
  expiring: { name: string; email: string; plan: string; expiresAt: string }[];
  byIndustry: { label: string; n: number }[]; byLevel: { label: string; n: number }[]; certsByIndustry: { label: string; n: number }[];
};
type CourseInfo = { id: string; title: string; defaultFree: string[]; labs: { id: string; title: string }[] };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const PLAN_LABEL: Record<string, string> = { free: "Free", individual: "Individual", bundle: "Labs + interview prep", team: "Team" };
const levelName = (id: string) => LAB_LEVELS.find((l) => l.id === id)?.label ?? id;

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return res.ok ? { data } : { error: (data?.error as string) ?? "Something went wrong" };
}

function Stat({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Bars({ title, rows, format = (s: string) => s }: { title: string; rows: { label: string; n: number }[]; format?: (s: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 && <p className="mt-2 text-sm text-gray-500">Nothing yet.</p>}
      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-xs">
            <span className="truncate" title={format(r.label)}>{format(r.label)}</span>
            <span className="h-2 rounded-full bg-brand-600" style={{ width: `${(r.n / max) * 100}%` }} />
            <span className="text-right text-gray-500">{r.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-2 py-2 font-medium">{children}</th>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800"><table className="min-w-full text-xs">{children}</table></div>;
}
const thead = "bg-gray-50 text-left text-gray-600 dark:bg-gray-900 dark:text-gray-300";
const tbody = "divide-y divide-gray-100 dark:divide-gray-800";
const td = "px-2 py-1.5 align-top";

export function AdminClient({
  overview, requests, learners, codes, settings, owners, courses,
}: {
  overview: Overview; requests: RequestRow[]; learners: LearnerRow[]; codes: CodeRow[]; settings: LabSettingsView; owners: string[]; courses: CourseInfo[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"overview" | "requests" | "learners" | "codes" | "settings">(overview.pending ? "requests" : "overview");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "requests", label: `Requests${overview.pending ? ` (${overview.pending})` : ""}` },
    { key: "learners", label: "Learners" },
    { key: "codes", label: "Access codes" },
    { key: "settings", label: "Settings" },
  ] as const;

  return (
    <div className="max-w-6xl">
      <Link href="/lab" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to labs</Link>
      <h1 className="text-2xl font-bold tracking-tight">Lab command centre</h1>
      <p className="mt-1 text-sm text-gray-500">Approve payments, manage learners and access codes, and change lab settings.</p>

      <div className="mt-5 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand-600 font-medium text-brand-700 dark:text-brand-300" : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab o={overview} />}
        {tab === "requests" && <RequestsTab rows={requests} defaultMonths={settings.defaultMonths} onDone={() => router.refresh()} toast={toast} />}
        {tab === "learners" && <LearnersTab rows={learners} defaultMonths={settings.defaultMonths} onDone={() => router.refresh()} toast={toast} />}
        {tab === "codes" && <CodesTab rows={codes} defaultMonths={settings.defaultMonths} onDone={() => router.refresh()} toast={toast} />}
        {tab === "settings" && <SettingsTab settings={settings} owners={owners} courses={courses} onDone={() => router.refresh()} toast={toast} />}
      </div>
    </div>
  );
}

type Toast = ReturnType<typeof useToast>;

function OverviewTab({ o }: { o: Overview }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Learners" value={o.learners} />
        <Stat label="On a paid plan" value={o.paid} tone="text-green-600" />
        <Stat label="Sign-ups, 7 days" value={o.signups7} />
        <Stat label="Sign-ups, 30 days" value={o.signups30} />
        <Stat label="Payments to approve" value={o.pending} tone={o.pending ? "text-amber-600" : ""} />
        <Stat label="Certificates issued" value={o.certificates} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bars title="Learners by industry" rows={o.byIndustry} />
        <Bars title="Learners by level" rows={o.byLevel} format={levelName} />
        <Bars title="Certificates by industry" rows={o.certsByIndustry} />
      </div>
      <div className="card">
        <h3 className="text-sm font-semibold">Access ending in the next 30 days</h3>
        <p className="text-xs text-gray-500">Good people to contact about renewing.</p>
        {o.expiring.length === 0 ? <p className="mt-2 text-sm text-gray-500">None.</p> : (
          <TableWrap>
            <thead className={thead}><tr><Th>Name</Th><Th>Email</Th><Th>Plan</Th><Th>Ends</Th></tr></thead>
            <tbody className={tbody}>
              {o.expiring.map((e) => (
                <tr key={e.email}><td className={td}>{e.name}</td><td className={td}>{e.email}</td><td className={td}>{PLAN_LABEL[e.plan]}</td><td className={td}>{day(e.expiresAt)}</td></tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
}

function RequestsTab({ rows, defaultMonths, onDone, toast }: { rows: RequestRow[]; defaultMonths: number; onDone: () => void; toast: Toast }) {
  const [deciding, setDeciding] = useState<{ row: RequestRow; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [plan, setPlan] = useState("individual");
  const [months, setMonths] = useState(defaultMonths);
  const [note, setNote] = useState("");
  const [showDone, setShowDone] = useState(false);
  const pending = rows.filter((r) => r.status === "PENDING");
  const done = rows.filter((r) => r.status !== "PENDING");

  function open(row: RequestRow, decision: "APPROVED" | "REJECTED") {
    setDeciding({ row, decision });
    setPlan(row.plan);
    setMonths(defaultMonths);
    setNote("");
  }
  async function decide() {
    if (!deciding) return;
    const r = await call("/api/lab/admin/requests", "PATCH", {
      id: deciding.row.id, decision: deciding.decision, note,
      ...(deciding.decision === "APPROVED" ? { plan, months } : {}),
    });
    if (r.error) return toast.error(r.error);
    toast.success(deciding.decision === "APPROVED" ? `${deciding.row.name} is unlocked` : "Request rejected");
    setDeciding(null);
    onDone();
  }

  return (
    <div>
      <h2 className="font-semibold">Waiting for approval</h2>
      <p className="text-xs text-gray-500">Check each reference against your UPI or bank statement before approving. Approving unlocks the learner at once.</p>
      {pending.length === 0 ? <p className="mt-3 text-sm text-gray-500">No payments waiting.</p> : (
        <TableWrap>
          <thead className={thead}><tr><Th>Received</Th><Th>Learner</Th><Th>Plan</Th><Th>Reference</Th><Th>Amount</Th><Th>Current access</Th><Th>{""}</Th></tr></thead>
          <tbody className={tbody}>
            {pending.map((r) => (
              <tr key={r.id}>
                <td className={td}>{day(r.createdAt)}</td>
                <td className={td}>{r.name}<span className="block text-gray-500">{r.email}</span></td>
                <td className={td}>{PLAN_LABEL[r.plan]}</td>
                <td className={`${td} font-mono`}>{r.reference}</td>
                <td className={td}>{r.amount || "—"}</td>
                <td className={td}>{r.currentAccess ?? "Free"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => open(r, "APPROVED")}>Approve</button>
                  <button className="ml-2 text-xs text-red-600 hover:underline" onClick={() => open(r, "REJECTED")}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <button className="mt-6 text-sm text-brand-600 hover:underline" onClick={() => setShowDone((v) => !v)}>
        {showDone ? "Hide" : "Show"} decided requests ({done.length})
      </button>
      {showDone && (
        <TableWrap>
          <thead className={thead}><tr><Th>Received</Th><Th>Learner</Th><Th>Plan</Th><Th>Reference</Th><Th>Decision</Th><Th>By</Th><Th>Note</Th></tr></thead>
          <tbody className={tbody}>
            {done.map((r) => (
              <tr key={r.id}>
                <td className={td}>{day(r.createdAt)}</td>
                <td className={td}>{r.name}<span className="block text-gray-500">{r.email}</span></td>
                <td className={td}>{PLAN_LABEL[r.plan]}</td>
                <td className={`${td} font-mono`}>{r.reference}</td>
                <td className={td}><span className={r.status === "APPROVED" ? "text-green-700" : "text-red-700"}>{r.status === "APPROVED" ? "Approved" : "Rejected"}</span> {day(r.decidedAt)}</td>
                <td className={td}>{r.decidedBy}</td>
                <td className={td}>{r.decisionNote || "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.decision === "APPROVED" ? "Approve payment" : "Reject request"} size="sm">
        {deciding && (
          <div className="space-y-3 text-sm">
            <p>{deciding.row.name} ({deciding.row.email}) · reference <span className="font-mono">{deciding.row.reference}</span>{deciding.row.amount && ` · ${deciding.row.amount}`}</p>
            {deciding.decision === "APPROVED" && (
              <div className="grid grid-cols-2 gap-3">
                <label>Plan
                  <select className="input mt-1" value={plan} onChange={(e) => setPlan(e.target.value)}>
                    <option value="individual">Individual</option><option value="bundle">Labs + interview prep</option><option value="team">Team</option>
                  </select>
                </label>
                <label>Months
                  <input type="number" min={1} max={36} className="input mt-1" value={months} onChange={(e) => setMonths(Number(e.target.value))} />
                </label>
              </div>
            )}
            <label className="block">{deciding.decision === "APPROVED" ? "Note (optional)" : "Reason (shown to the learner)"}
              <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeciding(null)}>Cancel</button>
              <button className={deciding.decision === "APPROVED" ? "btn-primary" : "btn-destructive"} onClick={decide}>
                {deciding.decision === "APPROVED" ? "Approve and unlock" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function LearnersTab({ rows, defaultMonths, onDone, toast }: { rows: LearnerRow[]; defaultMonths: number; onDone: () => void; toast: Toast }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [selected, setSelected] = useState<LearnerRow | null>(null);
  const [grant, setGrant] = useState({ plan: "individual", months: defaultMonths });
  const [level, setLevel] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((l) => (!planFilter || (planFilter === "paid" ? l.plan !== "free" : planFilter === "blocked" ? l.blocked : l.plan === planFilter))
      && (!q || `${l.name} ${l.email} ${l.industry}`.toLowerCase().includes(q)));
  }, [rows, search, planFilter]);

  async function act(url: string, body: unknown, done: string) {
    setBusy(true);
    const r = await call(url, "POST", body);
    setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success(done);
    setSelected(null);
    onDone();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-64 py-1.5 text-sm" placeholder="Search name, email or industry" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-44 py-1.5 text-sm" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filter by plan">
          <option value="">All learners</option><option value="free">Free</option><option value="paid">Any paid plan</option>
          <option value="individual">Individual</option><option value="bundle">Labs + interview prep</option><option value="team">Team</option><option value="blocked">Blocked</option>
        </select>
        <span className="text-xs text-gray-500">{shown.length} shown</span>
      </div>
      <TableWrap>
        <thead className={thead}><tr><Th>Name</Th><Th>Email</Th><Th>Joined</Th><Th>Plan</Th><Th>Until</Th><Th>Industry</Th><Th>Level</Th><Th>Tasks</Th><Th>Certs</Th><Th>{""}</Th></tr></thead>
        <tbody className={tbody}>
          {shown.map((l) => (
            <tr key={l.email} className={l.blocked ? "opacity-60" : ""}>
              <td className={td}>{l.name}{l.blocked && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">blocked</span>}</td>
              <td className={td}>{l.email}</td>
              <td className={td}>{day(l.joined)}</td>
              <td className={td}>{PLAN_LABEL[l.plan] ?? l.plan}</td>
              <td className={td}>{l.plan === "free" ? "—" : day(l.expiresAt)}</td>
              <td className={td}>{l.industry}</td>
              <td className={td}>{levelName(l.level)}</td>
              <td className={td}>{l.tasksDone}</td>
              <td className={td}>{l.certificates}</td>
              <td className={td}><button className="text-brand-600 hover:underline" onClick={() => { setSelected(l); setLevel(l.level || "practitioner"); setGrant({ plan: "individual", months: defaultMonths }); }}>Manage</button></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Modal open={!!selected} onClose={() => !busy && setSelected(null)} title={selected ? `Manage ${selected.name}` : ""} size="md">
        {selected && (
          <div className="space-y-5 text-sm">
            <p className="text-gray-500">{selected.email} · {PLAN_LABEL[selected.plan]}{selected.plan !== "free" && ` until ${day(selected.expiresAt)}`} · {selected.industry} · {levelName(selected.level)}</p>

            <section>
              <h3 className="font-medium">Access</h3>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label>Plan
                  <select className="input mt-1" value={grant.plan} onChange={(e) => setGrant({ ...grant, plan: e.target.value })}>
                    <option value="individual">Individual</option><option value="bundle">Labs + interview prep</option><option value="team">Team</option>
                  </select>
                </label>
                <label>Months to add
                  <input type="number" min={1} max={36} className="input mt-1 w-24" value={grant.months} onChange={(e) => setGrant({ ...grant, months: Number(e.target.value) })} />
                </label>
                <button className="btn-primary" disabled={busy} onClick={() => act("/api/lab/admin/grant", { email: selected.email, plan: grant.plan, months: grant.months }, "Access updated")}>Grant / extend</button>
                {selected.plan !== "free" && (
                  <button className="btn-secondary text-red-600" disabled={busy} onClick={() => act("/api/lab/admin/grant", { email: selected.email, plan: "revoke" }, "Paid access ended")}>End paid access</button>
                )}
              </div>
            </section>

            <section>
              <h3 className="font-medium">Practice company</h3>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label>Level
                  <select className="input mt-1" value={level} onChange={(e) => setLevel(e.target.value)}>
                    {LAB_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </label>
                <button className="btn-secondary" disabled={busy || level === selected.level} onClick={() => act("/api/lab/admin/learners", { email: selected.email, action: "level", level }, "Level changed; practice company rebuilt")}>Change level</button>
                <button className="btn-secondary" disabled={busy} onClick={() => act("/api/lab/admin/learners", { email: selected.email, action: "reset" }, "Practice company reset")}>Reset company</button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Both rebuild their practice company from scratch; lab progress restarts. Paid access and certificates stay.</p>
            </section>

            <section>
              <h3 className="font-medium">Account</h3>
              <button
                className={`mt-2 ${selected.blocked ? "btn-secondary" : "btn-destructive"}`} disabled={busy}
                onClick={() => act("/api/lab/admin/learners", { email: selected.email, action: selected.blocked ? "unblock" : "block" }, selected.blocked ? "Account unblocked" : "Account blocked")}
              >
                {selected.blocked ? "Unblock account" : "Block account"}
              </button>
              <p className="mt-1 text-xs text-gray-500">Blocked learners are signed out at once and can&apos;t sign in.</p>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CodesTab({ rows, defaultMonths, onDone, toast }: { rows: CodeRow[]; defaultMonths: number; onDone: () => void; toast: Toast }) {
  const [form, setForm] = useState({ plan: "individual", months: defaultMonths, seats: 5, count: 1, redeemByDays: 30, buyer: "", managerEmail: "", note: "" });
  const [created, setCreated] = useState<string[]>([]);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("/api/lab/admin/codes", "POST", { ...form, seats: form.plan === "team" ? form.seats : 1 });
    if (r.error) return toast.error(r.error);
    setCreated(r.data.codes);
    toast.success(`${r.data.codes.length} code(s) created`);
    onDone();
  }
  async function toggle(c: CodeRow) {
    const r = await call("/api/lab/admin/codes", "PATCH", { id: c.id, disabled: !c.disabled });
    if (r.error) return toast.error(r.error);
    onDone();
  }

  return (
    <div>
      <form onSubmit={create} className="card max-w-3xl space-y-3">
        <h2 className="font-semibold">Create access codes</h2>
        <p className="text-xs text-gray-500">For buyers who pay by invoice, or teams. Learners enter the code on their Labs page.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Plan
            <select className="input mt-1" value={form.plan} onChange={(e) => set({ plan: e.target.value })}>
              <option value="individual">Individual</option><option value="bundle">Labs + interview prep</option><option value="team">Team (one code, many seats)</option>
            </select>
          </label>
          <label className="text-sm">Months of access
            <input type="number" min={1} max={36} className="input mt-1" value={form.months} onChange={(e) => set({ months: Number(e.target.value) })} />
          </label>
          <label className="text-sm">Must be used within (days)
            <input type="number" min={1} max={365} className="input mt-1" value={form.redeemByDays} onChange={(e) => set({ redeemByDays: Number(e.target.value) })} />
          </label>
          {form.plan === "team" ? (
            <>
              <label className="text-sm">Seats
                <input type="number" min={1} max={500} className="input mt-1" value={form.seats} onChange={(e) => set({ seats: Number(e.target.value) })} />
              </label>
              <label className="text-sm sm:col-span-2">Manager&apos;s email (sees team progress)
                <input type="email" className="input mt-1" value={form.managerEmail} onChange={(e) => set({ managerEmail: e.target.value })} required />
              </label>
            </>
          ) : (
            <label className="text-sm">How many codes
              <input type="number" min={1} max={100} className="input mt-1" value={form.count} onChange={(e) => set({ count: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Buyer (name, email or company)
            <input className="input mt-1" value={form.buyer} onChange={(e) => set({ buyer: e.target.value })} maxLength={200} />
          </label>
          <label className="text-sm">Note (payment reference, invoice no.)
            <input className="input mt-1" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} />
          </label>
        </div>
        <button className="btn-primary"><Plus className="mr-2 h-4 w-4" /> Create</button>
        {created.length > 0 && (
          <div className="rounded-md bg-green-50 p-3 text-sm dark:bg-green-950">
            <p className="font-medium">Send this to the buyer:</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{created.join("\n")}</pre>
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
              onClick={() => navigator.clipboard.writeText(created.join("\n")).then(() => toast.success("Copied"))}>
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        )}
      </form>

      <h2 className="mt-8 font-semibold">All codes</h2>
      <TableWrap>
        <thead className={thead}><tr><Th>Code</Th><Th>Plan</Th><Th>Months</Th><Th>Seats used</Th><Th>Buyer</Th><Th>Used by</Th><Th>Use by</Th><Th>Created</Th><Th>{""}</Th></tr></thead>
        <tbody className={tbody}>
          {rows.map((c) => (
            <tr key={c.id} className={c.disabled ? "opacity-50" : ""}>
              <td className={`${td} whitespace-nowrap font-mono`}>{c.code}</td>
              <td className={td}>{PLAN_LABEL[c.plan]}</td>
              <td className={td}>{c.months}</td>
              <td className={td}>{c.used}/{c.seats}</td>
              <td className={td}>{c.buyer || "—"}{c.note && <span className="block text-gray-500">{c.note}</span>}</td>
              <td className={td}>{c.redeemedBy.join(", ") || "—"}</td>
              <td className={td}>{day(c.redeemBy)}</td>
              <td className={td}>{day(c.createdAt)}</td>
              <td className={td}><button className="text-brand-600 hover:underline" onClick={() => toggle(c)}>{c.disabled ? "Enable" : "Disable"}</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">No codes yet.</td></tr>}
        </tbody>
      </TableWrap>
    </div>
  );
}

function SettingsTab({ settings, owners, courses, onDone, toast }: { settings: LabSettingsView; owners: string[]; courses: CourseInfo[]; onDone: () => void; toast: Toast }) {
  const [s, setS] = useState(settings);
  const [newAdmin, setNewAdmin] = useState("");
  const [saving, setSaving] = useState(false);
  const free = (c: CourseInfo) => s.freeLabs[c.id] ?? c.defaultFree;

  function toggleFree(c: CourseInfo, labId: string) {
    const cur = new Set(free(c));
    if (cur.has(labId)) cur.delete(labId); else cur.add(labId);
    setS({ ...s, freeLabs: { ...s.freeLabs, [c.id]: c.labs.map((l) => l.id).filter((id) => cur.has(id)) } });
  }
  async function save() {
    setSaving(true);
    const r = await call("/api/lab/admin/settings", "PUT", {
      pricingText: s.pricingText, paymentText: s.paymentText, upiId: s.upiId, freeLabs: s.freeLabs,
      defaultMonths: s.defaultMonths, signupOpen: s.signupOpen, admins: s.admins,
    });
    setSaving(false);
    if (r.error) return toast.error(r.error);
    toast.success("Settings saved");
    onDone();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">Sign-ups</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.signupOpen} onChange={(e) => setS({ ...s, signupOpen: e.target.checked })} />
          Anyone can sign up for the labs
        </label>
        <p className="text-xs text-gray-500">Turn this off to pause new sign-ups; existing learners can still sign in.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Prices and payment</h2>
        <label className="block text-sm">Prices shown to free learners
          <textarea className="input mt-1 min-h-[70px]" value={s.pricingText} onChange={(e) => setS({ ...s, pricingText: e.target.value })} maxLength={1000} />
        </label>
        <label className="block text-sm">How to pay
          <textarea className="input mt-1 min-h-[70px]" value={s.paymentText} onChange={(e) => setS({ ...s, paymentText: e.target.value })} maxLength={1000} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">UPI ID (shown next to the payment text)
            <input className="input mt-1 font-mono" placeholder="name@bank" value={s.upiId} onChange={(e) => setS({ ...s, upiId: e.target.value.trim() })} maxLength={100} />
          </label>
          <label className="text-sm">Default months of access (approvals, grants, codes)
            <input type="number" min={1} max={36} className="input mt-1" value={s.defaultMonths} onChange={(e) => setS({ ...s, defaultMonths: Number(e.target.value) })} />
          </label>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Free labs</h2>
        <p className="text-xs text-gray-500">Free learners can open the ticked labs; everything else needs a paid plan.</p>
        {courses.map((c) => (
          <div key={c.id}>
            <p className="text-sm font-medium">{c.title}</p>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {c.labs.map((l, i) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={free(c).includes(l.id)} onChange={() => toggleFree(c, l.id)} />
                  {i + 1}. {l.title.replace(/\{\{\w+\}\}/g, "…")}
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Admins</h2>
        <p className="text-xs text-gray-500">Admins can approve payments, manage learners and change these settings.</p>
        <ul className="space-y-1 text-sm">
          {owners.map((e) => <li key={e} className="flex items-center gap-2">{e} <span className="text-xs text-gray-500">(server setting; can&apos;t be removed here)</span></li>)}
          {s.admins.filter((e) => !owners.includes(e)).map((e) => (
            <li key={e} className="flex items-center gap-2">
              {e}
              <button className="text-gray-400 hover:text-red-600" aria-label={`Remove ${e}`} onClick={() => setS({ ...s, admins: s.admins.filter((x) => x !== e) })}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input type="email" className="input w-72 py-1.5 text-sm" placeholder="colleague@example.com" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} />
          <button
            className="btn-secondary" type="button"
            onClick={() => {
              const e = newAdmin.trim().toLowerCase();
              if (!/^\S+@\S+\.\S+$/.test(e)) return toast.error("Enter an email address");
              if (!s.admins.includes(e)) setS({ ...s, admins: [...s.admins, e] });
              setNewAdmin("");
            }}
          >
            Add admin
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
        {settings.updatedAt && <span className="text-xs text-gray-500">Last changed {day(settings.updatedAt)} by {settings.updatedBy || "—"}</span>}
      </div>
    </div>
  );
}
