"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Plus } from "lucide-react";
import { useToast } from "@/components/toast";
import { LAB_LEVELS } from "@/lib/lab/levels";

type CodeRow = {
  id: string; code: string; plan: string; months: number; seats: number; used: number; buyer: string; managerEmail: string;
  note: string; disabled: boolean; createdAt: string; redeemBy: string | null; redeemedBy: string[];
};
type LearnerRow = {
  name: string; email: string; joined: string; plan: string; expiresAt: string | null; company: string; level: string;
  tasksDone: number; certificates: number;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const PLAN_LABEL: Record<string, string> = { free: "Free", individual: "Individual", bundle: "Labs + interview prep", team: "Team" };
const levelName = (id: string) => LAB_LEVELS.find((l) => l.id === id)?.label ?? "—";

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return res.ok ? { data } : { error: (data?.error as string) ?? "Something went wrong" };
}

export function AdminClient({ codes, learners }: { codes: CodeRow[]; learners: LearnerRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ plan: "individual", months: 12, seats: 1, count: 1, redeemByDays: 30, buyer: "", managerEmail: "", note: "" });
  const [created, setCreated] = useState<string[]>([]);
  const [grant, setGrant] = useState({ email: "", plan: "individual", months: 12, note: "" });
  const [search, setSearch] = useState("");
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const shownLearners = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? learners.filter((l) => `${l.name} ${l.email} ${l.company}`.toLowerCase().includes(q)) : learners;
  }, [learners, search]);
  const paid = learners.filter((l) => l.plan !== "free").length;

  async function createCodes(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("/api/lab/admin/codes", "POST", { ...form, seats: form.plan === "team" ? form.seats : 1 });
    if (r.error) return toast.error(r.error);
    setCreated(r.data.codes);
    toast.success(`${r.data.codes.length} code(s) created`);
    router.refresh();
  }

  async function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("/api/lab/admin/grant", "POST", grant.plan === "revoke"
      ? { email: grant.email, plan: "revoke", note: grant.note }
      : { email: grant.email, plan: grant.plan, months: grant.months, note: grant.note });
    if (r.error) return toast.error(r.error);
    toast.success(grant.plan === "revoke" ? "Paid access ended" : `Access until ${day(r.data.expiresAt)}`);
    router.refresh();
  }

  async function toggle(c: CodeRow) {
    const r = await call("/api/lab/admin/codes", "PATCH", { id: c.id, disabled: !c.disabled });
    if (r.error) return toast.error(r.error);
    router.refresh();
  }

  return (
    <div className="max-w-6xl">
      <Link href="/lab" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to labs</Link>
      <h1 className="text-2xl font-bold tracking-tight">Lab admin</h1>
      <p className="mt-1 text-sm text-gray-500">
        {learners.length} learners · {paid} on a paid plan. Take payment offline, then send the buyer an access code or grant access directly.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={createCodes} className="card space-y-3">
          <h2 className="font-semibold">Create access codes</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Plan
              <select className="input mt-1" value={form.plan} onChange={(e) => set({ plan: e.target.value })}>
                <option value="individual">Individual</option>
                <option value="bundle">Labs + interview prep</option>
                <option value="team">Team (one code, many seats)</option>
              </select>
            </label>
            <label className="text-sm">Months of access
              <input type="number" min={1} max={36} className="input mt-1" value={form.months} onChange={(e) => set({ months: Number(e.target.value) })} />
            </label>
            {form.plan === "team" ? (
              <>
                <label className="text-sm">Seats
                  <input type="number" min={1} max={500} className="input mt-1" value={form.seats} onChange={(e) => set({ seats: Number(e.target.value) })} />
                </label>
                <label className="text-sm">Manager&apos;s email (sees team progress)
                  <input type="email" className="input mt-1" value={form.managerEmail} onChange={(e) => set({ managerEmail: e.target.value })} required />
                </label>
              </>
            ) : (
              <label className="text-sm">How many codes
                <input type="number" min={1} max={100} className="input mt-1" value={form.count} onChange={(e) => set({ count: Number(e.target.value) })} />
              </label>
            )}
            <label className="text-sm">Must be used within (days)
              <input type="number" min={1} max={365} className="input mt-1" value={form.redeemByDays} onChange={(e) => set({ redeemByDays: Number(e.target.value) })} />
            </label>
          </div>
          <label className="block text-sm">Buyer (name, email or company)
            <input className="input mt-1" value={form.buyer} onChange={(e) => set({ buyer: e.target.value })} maxLength={200} />
          </label>
          <label className="block text-sm">Note (payment reference, invoice no.)
            <input className="input mt-1" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} />
          </label>
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

        <form onSubmit={submitGrant} className="card space-y-3">
          <h2 className="font-semibold">Grant, extend or end access</h2>
          <p className="text-xs text-gray-500">For someone who has already signed up. Months are added to any access they still have.</p>
          <label className="block text-sm">Learner&apos;s email
            <input type="email" className="input mt-1" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Plan
              <select className="input mt-1" value={grant.plan} onChange={(e) => setGrant({ ...grant, plan: e.target.value })}>
                <option value="individual">Individual</option>
                <option value="bundle">Labs + interview prep</option>
                <option value="team">Team</option>
                <option value="revoke">End paid access now</option>
              </select>
            </label>
            {grant.plan !== "revoke" && (
              <label className="text-sm">Months to add
                <input type="number" min={1} max={36} className="input mt-1" value={grant.months} onChange={(e) => setGrant({ ...grant, months: Number(e.target.value) })} />
              </label>
            )}
          </div>
          <label className="block text-sm">Note
            <input className="input mt-1" value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} maxLength={500} />
          </label>
          <button className={grant.plan === "revoke" ? "btn-destructive" : "btn-primary"}>{grant.plan === "revoke" ? "End access" : "Grant access"}</button>
        </form>
      </div>

      <h2 className="mt-8 font-semibold">Access codes</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            <tr>{["Code", "Plan", "Months", "Seats used", "Buyer", "Used by", "Use by", "Created", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {codes.map((c) => (
              <tr key={c.id} className={c.disabled ? "opacity-50" : ""}>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">{c.code}</td>
                <td className="px-2 py-1.5">{PLAN_LABEL[c.plan]}</td>
                <td className="px-2 py-1.5">{c.months}</td>
                <td className="px-2 py-1.5">{c.used}/{c.seats}</td>
                <td className="px-2 py-1.5">{c.buyer || "—"}{c.note && <span className="block text-gray-500">{c.note}</span>}</td>
                <td className="px-2 py-1.5">{c.redeemedBy.join(", ") || "—"}</td>
                <td className="px-2 py-1.5">{day(c.redeemBy)}</td>
                <td className="px-2 py-1.5">{day(c.createdAt)}</td>
                <td className="px-2 py-1.5"><button className="text-brand-600 hover:underline" onClick={() => toggle(c)}>{c.disabled ? "Enable" : "Disable"}</button></td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">No codes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Learners</h2>
        <input className="input w-64 py-1.5 text-sm" placeholder="Search name, email or company" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            <tr>{["Name", "Email", "Joined", "Plan", "Access until", "Practice company", "Level", "Tasks done", "Certificates"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {shownLearners.map((l) => (
              <tr key={l.email}>
                <td className="px-2 py-1.5">{l.name}</td>
                <td className="px-2 py-1.5">{l.email}</td>
                <td className="px-2 py-1.5">{day(l.joined)}</td>
                <td className="px-2 py-1.5">{PLAN_LABEL[l.plan] ?? l.plan}</td>
                <td className="px-2 py-1.5">{l.plan === "free" ? "—" : day(l.expiresAt)}</td>
                <td className="px-2 py-1.5">{l.company}</td>
                <td className="px-2 py-1.5">{levelName(l.level)}</td>
                <td className="px-2 py-1.5">{l.tasksDone}</td>
                <td className="px-2 py-1.5">{l.certificates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
