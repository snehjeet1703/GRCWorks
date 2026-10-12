"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  Shield, CheckCircle2, Lock, Download, Search, ChevronDown, ChevronUp, X, Send,
  Folder, FileText, MapPin, ArrowRight, Globe, Eye,
} from "lucide-react";
import { FrameworkBadge } from "@/components/framework-badge";
import { TrustControlIcon } from "@/components/trust-control-icon";

type DocMeta = {
  id: string; name: string; description?: string; category: string;
  permission?: string; fileSize?: number; visibility: string; viewable?: boolean;
};

type TrustData = {
  organization: { name: string; slug: string };
  config: {
    heroTitle: string;
    heroDescription: string;
    primaryColor: string;
    showCompliance: boolean;
    showDocuments: boolean;
    showControls: boolean;
    showSubprocessors: boolean;
    requireNda: boolean;
    hasLogo: boolean;
  };
  badges: { id: string; name: string; description: string; iconUrl: string }[];
  documents: DocMeta[];
  lockedDocuments: DocMeta[];
  controls: { id: string; category: string; name: string }[];
  subprocessors: { id: string; name: string; purpose: string; location: string; website: string }[];
  hasRestrictedDocs: boolean;
};

type DocItem = DocMeta & { locked: boolean };

const FOLDERS_SHOWN = 6;
const SUBPROCESSORS_SHOWN = 6;

export function TrustPage({ slug }: { slug: string }) {
  const [data, setData] = useState<TrustData | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [grantedDocs, setGrantedDocs] = useState<DocMeta[]>([]);
  const [accessUser, setAccessUser] = useState<{ name: string; company: string } | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<"All" | "Public" | "Private">("All");
  const [showAllFolders, setShowAllFolders] = useState(false);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState("compliance");
  const [ndaRequired, setNdaRequired] = useState(false);
  const [ndaAccepted, setNdaAccepted] = useState(true);
  const [ndaData, setNdaData] = useState<{ id: string; title: string; content: string; version: number } | null>(null);
  const [showNdaModal, setShowNdaModal] = useState(false);
  const [acceptingNda, setAcceptingNda] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`trust_token_${slug}`);
      if (saved) setToken(saved);
    } catch {}

    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get("token");
    if (urlToken) {
      setToken(urlToken);
      try { localStorage.setItem(`trust_token_${slug}`, urlToken); } catch {}
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
  }, [slug]);

  useEffect(() => {
    fetch(`/api/trust/${slug}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError("Trust vault not found or not enabled."));
  }, [slug]);

  const verifyToken = useCallback(async (t: string) => {
    try {
      const res = await fetch(`/api/trust/${slug}/verify?token=${encodeURIComponent(t)}`);
      if (!res.ok) {
        setToken(null);
        try { localStorage.removeItem(`trust_token_${slug}`); } catch {}
        return;
      }
      const result = await res.json();
      setGrantedDocs(result.documents || []);
      setAccessUser({ name: result.name, company: result.company });
      if (result.ndaRequired) {
        setNdaRequired(true);
        setNdaAccepted(result.ndaAccepted);
        if (!result.ndaAccepted) {
          fetch(`/api/trust/${slug}/nda`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.nda) setNdaData(d.nda); });
        }
      }
    } catch {}
  }, [slug]);

  useEffect(() => {
    if (token) verifyToken(token);
  }, [token, verifyToken]);

  const canViewRestricted = !ndaRequired || ndaAccepted;

  const allDocs: DocItem[] = useMemo(() => {
    if (!data) return [];
    const accessible = [
      ...data.documents,
      ...(canViewRestricted ? grantedDocs.filter((g) => !data.documents.some((d) => d.id === g.id)) : []),
    ];
    const accessibleIds = new Set(accessible.map((d) => d.id));
    return [
      ...accessible.map((d) => ({ ...d, locked: false })),
      ...data.lockedDocuments.filter((d) => !accessibleIds.has(d.id)).map((d) => ({ ...d, locked: true })),
    ];
  }, [data, grantedDocs, canViewRestricted]);

  const folders = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const matches = allDocs.filter((d) => {
      if (docFilter === "Public" && d.visibility !== "PUBLIC") return false;
      if (docFilter === "Private" && d.visibility !== "ACCESS_REQUIRED") return false;
      return !q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
    });
    const byCategory = new Map<string, DocItem[]>();
    for (const d of matches) byCategory.set(d.category, [...(byCategory.get(d.category) ?? []), d]);
    return [...byCategory.entries()].map(([category, docs]) => ({ category, docs }));
  }, [allDocs, docFilter, docSearch]);

  const controlsByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of data?.controls ?? []) map.set(c.category, [...(map.get(c.category) ?? []), c.name]);
    return [...map.entries()];
  }, [data]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-16 w-16 text-gray-300" />
          <h1 className="mt-4 text-xl font-semibold text-gray-700">Trust Vault</h1>
          <p className="mt-2 text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const { config, badges, subprocessors } = data;
  const primary = config.primaryColor || "#6366f1";
  const orgName = config.heroTitle || data.organization.name;
  const longIntro = config.heroDescription.length > 280 || config.heroDescription.split("\n").length > 3;
  const hasLocked = allDocs.some((d) => d.locked);
  const folderDocs = folders.find((f) => f.category === openFolder)?.docs ?? [];
  const categoryItems = controlsByCategory.find(([c]) => c === openCategory)?.[1] ?? [];

  const sections = [
    config.showCompliance && badges.length > 0 && "Compliance",
    config.showDocuments && "Documents",
    config.showControls && controlsByCategory.length > 0 && "Controls",
    config.showSubprocessors && subprocessors.length > 0 && "Sub-processors",
  ].filter(Boolean) as string[];

  const downloadHref = (id: string) =>
    `/api/trust/${slug}/documents/${id}/download${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  // toolbar=0 hides the browser PDF toolbar (download/print); the per-viewer watermark is the real control.
  const viewHref = (id: string) =>
    `/api/trust/${slug}/documents/${id}/view${token ? `?token=${encodeURIComponent(token)}` : ""}#toolbar=0&navpanes=0`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-20 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {config.hasLogo ? (
                <img src={`/api/trust/${slug}/logo`} alt={`${data.organization.name} logo`} className="h-8 max-w-[160px] object-contain" />
              ) : (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: primary }}>
                    <Shield className="h-4 w-4 text-white" />
                  </span>
                  <span className="truncate font-semibold text-gray-900">{data.organization.name}</span>
                </>
              )}
              <span className="hidden h-6 w-px bg-gray-200 sm:block" />
              <span className="hidden whitespace-nowrap font-medium text-gray-700 sm:inline">Trust Vault</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {accessUser && (
                <span className="hidden text-xs text-gray-500 sm:inline">
                  Viewing as <strong className="text-gray-700">{accessUser.name}</strong>
                </span>
              )}
              {!token && data.hasRestrictedDocs && (
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 sm:px-4"
                  style={{ backgroundColor: primary }}
                >
                  <Lock className="h-4 w-4" /> Login/Get Access
                </button>
              )}
            </div>
          </div>

          <div className="pb-6 pt-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{orgName}</h1>
            {config.heroDescription && (
              <>
                <p className={`mt-3 max-w-4xl whitespace-pre-line text-sm leading-relaxed text-gray-600 ${!heroExpanded && longIntro ? "line-clamp-3" : ""}`}>
                  {config.heroDescription}
                </p>
                {longIntro && (
                  <button
                    onClick={() => setHeroExpanded(!heroExpanded)}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium"
                    style={{ color: primary }}
                  >
                    {heroExpanded ? "View less" : "View more"} <ArrowRight className={`h-4 w-4 transition-transform ${heroExpanded ? "-rotate-90" : ""}`} />
                  </button>
                )}
              </>
            )}
          </div>

          {sections.length > 1 && (
            <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Sections">
              {sections.map((s) => {
                const id = s.toLowerCase();
                const active = activeSection === id;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setActiveSection(id);
                      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${active ? "" : "border-transparent text-gray-500 hover:text-gray-800"}`}
                    style={active ? { color: primary, borderColor: primary } : undefined}
                  >
                    {s}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      {token && ndaRequired && !ndaAccepted && ndaData && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <p className="text-sm text-amber-800">
              <Shield className="mr-1.5 inline h-4 w-4" />
              You must accept the NDA before viewing restricted documents.
            </p>
            <button
              onClick={() => setShowNdaModal(true)}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Review & Accept NDA
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {config.showCompliance && badges.length > 0 && (
          <Section id="compliance" title="Compliance">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => (
                <div key={b.id} className="relative flex items-center gap-4 rounded-xl border border-gray-200 p-5">
                  {b.iconUrl ? (
                    <img src={b.iconUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <FrameworkBadge name={b.name} size={56} fallbackColor={primary} />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{b.name}</p>
                    {b.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{b.description}</p>}
                  </div>
                  <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 fill-emerald-500 text-white" aria-label="Compliant" />
                </div>
              ))}
            </div>
          </Section>
        )}

        {config.showDocuments && (
          <Section id="documents" title="Documents">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Document visibility">
                {(["All", "Public", "Private"] as const).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={docFilter === f}
                    onClick={() => setDocFilter(f)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${docFilter === f ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Search by framework or document name"
                  aria-label="Search documents"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:outline-none focus:ring-2"
                  style={{ ["--tw-ring-color" as string]: `${primary}33` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(showAllFolders ? folders : folders.slice(0, FOLDERS_SHOWN)).map(({ category, docs }) => {
                const locked = docs.some((d) => d.locked);
                return (
                  <button
                    key={category}
                    onClick={() => setOpenFolder(category)}
                    className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primary}14`, color: primary }}>
                      <Folder className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-gray-400">Documents</span>
                      <span className="block truncate font-semibold text-gray-900">{category}</span>
                      <span className="block text-xs text-gray-500">{docs.length} document{docs.length === 1 ? "" : "s"}</span>
                    </span>
                    {locked && <Lock className="h-4 w-4 shrink-0" style={{ color: primary }} aria-label="Contains restricted documents" />}
                  </button>
                );
              })}
            </div>
            {folders.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">No documents match your search.</p>
            )}
            {folders.length > FOLDERS_SHOWN && (
              <button
                onClick={() => setShowAllFolders(!showAllFolders)}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: primary }}
              >
                {showAllFolders ? "Show less" : "Show more"}
                {showAllFolders ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            {!token && hasLocked && (
              <p className="mt-5 rounded-lg bg-gray-50 p-3 text-center text-sm text-gray-600">
                Some documents require access approval.{" "}
                <button onClick={() => setShowRequestModal(true)} className="font-medium underline" style={{ color: primary }}>
                  Request access
                </button>
              </p>
            )}
          </Section>
        )}

        {config.showControls && controlsByCategory.length > 0 && (
          <Section id="controls" title="Controls">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {controlsByCategory.map(([category, items]) => (
                <div key={category} className="flex flex-col rounded-xl border border-gray-200 p-5">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
                    <TrustControlIcon category={category} className="h-5 w-5 text-gray-700" />
                    {category}
                  </h3>
                  <ul className="flex-1 space-y-2">
                    {items.slice(0, 3).map((name) => (
                      <li key={name} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                        <span className="truncate">{name}</span>
                        <CheckCircle2 className="h-4 w-4 shrink-0 fill-emerald-500 text-white" aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setOpenCategory(category)}
                    className="mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium"
                    style={{ color: primary }}
                  >
                    View all <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {config.showSubprocessors && subprocessors.length > 0 && (
          <Section
            id="sub-processors"
            title="Sub-Processors"
            action={subprocessors.length > SUBPROCESSORS_SHOWN && (
              <button onClick={() => setShowAllSubs(!showAllSubs)} className="text-sm font-medium" style={{ color: primary }}>
                {showAllSubs ? "Show less" : "View all"}
              </button>
            )}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(showAllSubs ? subprocessors : subprocessors.slice(0, SUBPROCESSORS_SHOWN)).map((sp) => (
                <div key={sp.id} className="rounded-xl border border-gray-200 p-4">
                  <p className="flex items-center gap-2 font-semibold text-gray-900">
                    <Globe className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="truncate">{sp.name}</span>
                  </p>
                  {sp.purpose && <p className="mt-1 text-xs text-gray-500">{sp.purpose}</p>}
                  {sp.location && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin className="h-4 w-4 shrink-0" /> {sp.location}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </main>

      <footer className="py-8 text-center text-xs text-gray-400">
        Monitored on <span className="inline-flex items-center gap-1 font-semibold text-gray-600"><Shield className="h-3.5 w-3.5" /> GRC Platform</span>
      </footer>

      {openFolder && (
        <Dialog title={openFolder} onClose={() => setOpenFolder(null)}>
          <ul className="divide-y divide-gray-100">
            {folderDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                  {d.description && <p className="truncate text-xs text-gray-500">{d.description}</p>}
                </div>
                {d.locked ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
                    <Lock className="h-3.5 w-3.5" /> Restricted
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-3">
                    {d.viewable && (
                      <button
                        onClick={() => setViewing({ id: d.id, name: d.name })}
                        className="inline-flex items-center gap-1.5 text-sm font-medium"
                        style={{ color: primary }}
                      >
                        <Eye className="h-4 w-4" /> View
                      </button>
                    )}
                    {d.permission === "DOWNLOADABLE" ? (
                      <a href={downloadHref(d.id)} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: primary }}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    ) : (
                      !d.viewable && <span className="text-xs text-gray-500">Ask the owner for access</span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!token && folderDocs.some((d) => d.locked) && (
            <button
              onClick={() => { setOpenFolder(null); setShowRequestModal(true); }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: primary }}
            >
              <Lock className="h-4 w-4" /> Request access to restricted documents
            </button>
          )}
        </Dialog>
      )}

      {viewing && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-gray-900/80 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={viewing.name}>
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded-t-xl bg-white px-4 py-3">
            <p className="flex min-w-0 items-center gap-2 font-medium text-gray-900">
              <Eye className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate">{viewing.name}</span>
              <span className="hidden shrink-0 text-xs font-normal text-gray-500 sm:inline">· watermarked, view only</span>
            </p>
            <button onClick={() => setViewing(null)} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close viewer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <iframe
            src={viewHref(viewing.id)}
            title={viewing.name}
            className="mx-auto w-full max-w-5xl flex-1 rounded-b-xl bg-gray-100"
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}

      {openCategory && (
        <Dialog title={openCategory} onClose={() => setOpenCategory(null)}>
          <ul className="divide-y divide-gray-100">
            {categoryItems.map((name) => (
              <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm text-gray-700">
                {name}
                <CheckCircle2 className="h-4 w-4 shrink-0 fill-emerald-500 text-white" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {showNdaModal && ndaData && token && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{ndaData.title} (v{ndaData.version})</h2>
              <button onClick={() => setShowNdaModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{ndaData.content}</pre>
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button onClick={() => setShowNdaModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                disabled={acceptingNda}
                onClick={async () => {
                  setAcceptingNda(true);
                  try {
                    const res = await fetch(`/api/trust/${slug}/nda`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ token, ndaId: ndaData.id }),
                    });
                    if (res.ok) {
                      setNdaAccepted(true);
                      setShowNdaModal(false);
                      if (token) verifyToken(token);
                    }
                  } catch {} finally { setAcceptingNda(false); }
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                {acceptingNda ? "Accepting..." : "I Accept the NDA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequestModal && (
        <RequestAccessModal slug={slug} primary={primary} onClose={() => setShowRequestModal(false)} />
      )}
    </div>
  );
}

function Section({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={`section-${id}`} className="scroll-mt-4 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-2 pb-5">{children}</div>
      </div>
    </div>
  );
}

function RequestAccessModal({ slug, primary, onClose }: { slug: string; primary: string; onClose: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", company: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/trust/${slug}/request-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Request Access</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h4 className="mt-4 text-lg font-medium text-gray-900">Request Submitted</h4>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ll review your request and send you an access link at <strong>{form.email}</strong>.
            </p>
            <button onClick={onClose} className="mt-6 rounded-lg px-6 py-2 text-sm font-medium text-white" style={{ backgroundColor: primary }}>
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-6 py-4">
            <p className="text-sm text-gray-500">
              Please use your official company email. Personal email addresses are not accepted.
            </p>

            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div>
              <label htmlFor="ra-name" className="mb-1 block text-sm font-medium text-gray-700">Full Name *</label>
              <input id="ra-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="John Smith" />
            </div>
            <div>
              <label htmlFor="ra-email" className="mb-1 block text-sm font-medium text-gray-700">Company Email *</label>
              <input id="ra-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="john@company.com" />
            </div>
            <div>
              <label htmlFor="ra-company" className="mb-1 block text-sm font-medium text-gray-700">Company *</label>
              <input id="ra-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputClass} placeholder="Company Inc." />
            </div>
            <div>
              <label htmlFor="ra-reason" className="mb-1 block text-sm font-medium text-gray-700">Reason (optional)</label>
              <textarea id="ra-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className={inputClass} placeholder="Why do you need access?" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !form.name || !form.email || !form.company}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: primary }}
              >
                <Send className="mr-1.5 inline h-4 w-4" />
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
