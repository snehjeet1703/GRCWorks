"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Library, PenLine, Check } from "lucide-react";
import { Modal } from "@/components/modal";
import { Field, TextArea, TextInput, FormError } from "@/components/form";
import { FrameworkBadge } from "@/components/framework-badge";
import { useToast } from "@/components/toast";

type CatalogItem = { name: string; description: string; requirements: number };

// Common privacy laws and standards people add as custom frameworks; picking one fills the form.
const SUGGESTIONS = [
  { name: "PDPA (Singapore)", version: "2012", description: "Singapore Personal Data Protection Act." },
  { name: "PDPL (Saudi Arabia)", version: "2021", description: "Saudi Arabia Personal Data Protection Law." },
  { name: "UAE PDPL", version: "2021", description: "UAE Federal Decree-Law on the Protection of Personal Data." },
  { name: "CCPA / CPRA", version: "2023", description: "California Consumer Privacy Act as amended by the CPRA." },
  { name: "LGPD (Brazil)", version: "2020", description: "Brazil's General Data Protection Law." },
  { name: "UK GDPR", version: "2021", description: "UK General Data Protection Regulation and Data Protection Act 2018." },
];

export function AddFramework({ catalog, existing }: { catalog: CatalogItem[]; existing: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");
  const [custom, setCustom] = useState({ name: "", version: "", description: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const has = (n: string) => existing.some((e) => e.toLowerCase() === n.toLowerCase());

  const add = async (body: Record<string, string>) => {
    setBusy(body.name);
    setError(null);
    const res = await fetch("/api/frameworks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data?.error ?? "Couldn't add the framework");
    setOpen(false);
    setCustom({ name: "", version: "", description: "" });
    if (body.type === "catalog") {
      toast.success(`Added ${data.name}: ${data.requirements} requirements, ${data.controlsCreated} new controls${data.controlsReused ? `, ${data.controlsReused} existing controls reused` : ""}.`);
      startTransition(() => router.push(`/compliance/${data.id}`));
    } else {
      toast.success(`Added ${data.name}. Now import its requirements and controls from a sheet.`);
      startTransition(() => router.push(`/compliance/${data.id}?import=1`));
    }
  };

  const tabCls = (t: string) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-white shadow-sm dark:bg-gray-900" : "text-gray-500 hover:text-gray-800"}`;

  return (
    <>
      <button className="btn-primary" onClick={() => { setOpen(true); setError(null); }}>
        <Plus className="mr-2 h-4 w-4" /> Add framework
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a framework" size="lg">
        <div className="space-y-4">
          <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            <button type="button" className={tabCls("catalog")} onClick={() => setTab("catalog")}><Library className="h-4 w-4" /> Built-in</button>
            <button type="button" className={tabCls("custom")} onClick={() => setTab("custom")}><PenLine className="h-4 w-4" /> Any other framework or law</button>
          </div>
          <FormError message={error} />

          {tab === "catalog" ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Comes with its requirements and controls. Controls you already have are reused, so existing evidence counts straight away.</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {catalog.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 px-3 py-2.5">
                    <FrameworkBadge name={c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-gray-500">{c.description} · {c.requirements} requirements</p>
                    </div>
                    {has(c.name) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700"><Check className="h-3.5 w-3.5" /> Added</span>
                    ) : (
                      <button type="button" disabled={busy !== null} onClick={() => add({ type: "catalog", name: c.name })} className="btn-secondary !px-3 !py-1 text-xs">
                        {busy === c.name ? "Adding…" : "Add"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); add({ type: "custom", ...custom }); }}
            >
              <p className="text-sm text-gray-500">
                Add any privacy law, regulation or internal standard. After creating it you&apos;ll import its requirements and controls from
                a spreadsheet; controls can count towards several frameworks at once.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.filter((x) => !has(x.name)).map((x) => (
                  <button key={x.name} type="button" onClick={() => setCustom(x)}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                    {x.name}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <Field label="Name" htmlFor="fwName">
                  <TextInput id="fwName" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="e.g. PDPA (Singapore)" required />
                </Field>
                <Field label="Version / year" htmlFor="fwVersion">
                  <TextInput id="fwVersion" value={custom.version} onChange={(e) => setCustom({ ...custom, version: e.target.value })} placeholder="2012" />
                </Field>
              </div>
              <Field label="Description (optional)" htmlFor="fwDesc">
                <TextArea id="fwDesc" rows={2} value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={busy !== null || custom.name.trim().length < 2} className="btn-primary">
                  {busy ? "Creating…" : "Create and import requirements"}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}
