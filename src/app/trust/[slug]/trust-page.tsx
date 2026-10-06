"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, CheckCircle, FileText, Globe, Lock, Download,
  Search, ChevronDown, ChevronUp, X, Send, Eye,
} from "lucide-react";

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
  };
  badges: { id: string; name: string; description: string; iconUrl: string }[];
  documents: {
    id: string; name: string; description: string; category: string;
    permission: string; fileSize: number; visibility: string;
  }[];
  controls: { id: string; code: string; title: string }[];
  subprocessors: { id: string; name: string; purpose: string; location: string; website: string }[];
  hasRestrictedDocs: boolean;
};

type GrantedDoc = {
  id: string; name: string; description: string; category: string;
  permission: string; fileSize: number; visibility: string;
};

export function TrustPage({ slug }: { slug: string }) {
  const [data, setData] = useState<TrustData | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [grantedDocs, setGrantedDocs] = useState<GrantedDoc[]>([]);
  const [accessUser, setAccessUser] = useState<{ name: string; company: string } | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<"All" | "Public" | "Private">("All");
  const [controlsExpanded, setControlsExpanded] = useState<Record<string, boolean>>({});
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

  const { config, badges, documents, controls, subprocessors } = data;
  const primary = config.primaryColor || "#6366f1";
  const canViewRestricted = !ndaRequired || ndaAccepted;
  const allDocs = [...documents, ...(canViewRestricted ? grantedDocs.filter((gd) => !documents.find((d) => d.id === gd.id)) : [])];
  const filteredDocs = allDocs.filter((d) => {
    if (docSearch && !d.name.toLowerCase().includes(docSearch.toLowerCase()) && !d.category.toLowerCase().includes(docSearch.toLowerCase())) return false;
    if (docFilter === "Public" && d.visibility !== "PUBLIC") return false;
    if (docFilter === "Private" && d.visibility !== "ACCESS_REQUIRED") return false;
    return true;
  });
  const docCategories = [...new Set(allDocs.map((d) => d.category))];

  const controlsByCategory: Record<string, typeof controls> = {};
  controls.forEach((c) => {
    const cat = c.code.replace(/[-_]?\d+$/, "") || "General";
    if (!controlsByCategory[cat]) controlsByCategory[cat] = [];
    controlsByCategory[cat].push(c);
  });

  const sections = [
    config.showCompliance && "Compliance",
    config.showDocuments && "Documents",
    config.showControls && "Controls",
    config.showSubprocessors && "Sub-processors",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: primary }}>
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">{data.organization.name}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-sm text-gray-500">Trust Vault</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {accessUser && (
              <span className="text-xs text-gray-500">
                Viewing as <strong>{accessUser.name}</strong>
              </span>
            )}
            {!token && data.hasRestrictedDocs && (
              <button
                onClick={() => setShowRequestModal(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: primary }}
              >
                <Lock className="mr-1.5 inline h-4 w-4" />
                Login/Get Access
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl font-bold text-gray-900">
            {config.heroTitle || data.organization.name}
          </h1>
          {config.heroDescription && (
            <p className="mt-4 max-w-3xl text-gray-600 leading-relaxed whitespace-pre-line">
              {config.heroDescription}
            </p>
          )}
        </div>
      </section>

      {/* NDA Banner */}
      {token && ndaRequired && !ndaAccepted && ndaData && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-amber-800">
              <Shield className="inline h-4 w-4 mr-1.5" />
              You must accept the NDA before viewing restricted documents.
            </p>
            <button
              onClick={() => setShowNdaModal(true)}
              className="rounded-lg px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700"
            >
              Review & Accept NDA
            </button>
          </div>
        </div>
      )}

      {/* NDA Acceptance Modal */}
      {showNdaModal && ndaData && token && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">{ndaData.title} (v{ndaData.version})</h2>
              <button onClick={() => setShowNdaModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{ndaData.content}</pre>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
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

      {/* Section Nav */}
      <nav className="sticky top-16 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto flex max-w-6xl gap-6 px-4">
          {sections.map((s) => (
            <button
              key={s}
              onClick={() => {
                setActiveSection(s.toLowerCase());
                document.getElementById(`section-${s.toLowerCase()}`)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                activeSection === s.toLowerCase()
                  ? "border-current text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={activeSection === s.toLowerCase() ? { color: primary, borderColor: primary } : undefined}
            >
              {s}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-10">
        {/* Compliance Badges */}
        {config.showCompliance && badges.length > 0 && (
          <section id="section-compliance">
            <div className="rounded-2xl bg-white border border-gray-200 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Compliance</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {badges.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: primary }}>
                      {b.iconUrl ? (
                        <img src={b.iconUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        b.name.slice(0, 4).toUpperCase()
                      )}
                    </div>
                    <span className="font-medium text-gray-900">{b.name}</span>
                    <CheckCircle className="ml-auto h-5 w-5 flex-shrink-0 text-green-500" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Documents */}
        {config.showDocuments && (
          <section id="section-documents">
            <div className="rounded-2xl bg-white border border-gray-200 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Documents</h2>

              <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex rounded-full bg-gray-100 p-0.5">
                  {(["All", "Public", "Private"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setDocFilter(f)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                        docFilter === f
                          ? "bg-gray-900 text-white"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Search by framework or control name"
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-4 text-sm text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDocs.map((d) => (
                  <div key={d.id} className="rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Compliance</p>
                        <h3 className="font-medium text-gray-900">{d.name}</h3>
                        {d.description && <p className="text-xs text-gray-500 mt-1">{d.description}</p>}
                      </div>
                      {d.visibility === "ACCESS_REQUIRED" && (
                        <Lock className="h-4 w-4 flex-shrink-0 text-gray-400 mt-1" />
                      )}
                    </div>
                    {d.permission === "DOWNLOADABLE" && (
                      <a
                        href={`/api/trust/${slug}/documents/${d.id}/download${token ? `?token=${encodeURIComponent(token)}` : ""}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                        style={{ color: primary }}
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {filteredDocs.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">No documents match your search.</p>
              )}

              {!token && data.hasRestrictedDocs && (
                <div className="mt-6 rounded-lg bg-gray-50 p-4 text-center">
                  <p className="text-sm text-gray-600">
                    Some documents require access approval.{" "}
                    <button onClick={() => setShowRequestModal(true)} className="font-medium underline" style={{ color: primary }}>
                      Request access
                    </button>
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Controls */}
        {config.showControls && Object.keys(controlsByCategory).length > 0 && (
          <section id="section-controls">
            <div className="rounded-2xl bg-white border border-gray-200 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Controls</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(controlsByCategory).map(([category, items]) => {
                  const expanded = controlsExpanded[category];
                  const shown = expanded ? items : items.slice(0, 3);
                  return (
                    <div key={category} className="rounded-xl border border-gray-100 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-5 w-5" style={{ color: primary }} />
                        <h3 className="font-medium text-gray-900">{category}</h3>
                      </div>
                      <ul className="space-y-2">
                        {shown.map((c) => (
                          <li key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="truncate">{c.title}</span>
                            <CheckCircle className="ml-auto h-4 w-4 flex-shrink-0 text-green-500" />
                          </li>
                        ))}
                      </ul>
                      {items.length > 3 && (
                        <button
                          onClick={() => setControlsExpanded({ ...controlsExpanded, [category]: !expanded })}
                          className="mt-2 flex items-center gap-1 text-xs font-medium"
                          style={{ color: primary }}
                        >
                          {expanded ? (
                            <>Show less <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>View all <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Sub-processors */}
        {config.showSubprocessors && subprocessors.length > 0 && (
          <section id="section-sub-processors">
            <div className="rounded-2xl bg-white border border-gray-200 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Sub-Processors</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {subprocessors.map((sp) => (
                  <div key={sp.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                      <Globe className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{sp.name}</p>
                      {sp.location && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          {sp.location}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8 mt-10">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-gray-400">
          Powered by GRC Platform &middot; Trust Vault
        </div>
      </footer>

      {/* Request Access Modal */}
      {showRequestModal && (
        <RequestAccessModal
          slug={slug}
          primary={primary}
          onClose={() => setShowRequestModal(false)}
        />
      )}
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Request Access</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h4 className="mt-4 text-lg font-medium text-gray-900">Request Submitted</h4>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ll review your request and send you an access link at <strong>{form.email}</strong>.
            </p>
            <button onClick={onClose} className="mt-6 rounded-lg px-6 py-2 text-sm font-medium text-white" style={{ backgroundColor: primary }}>
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-4">
            <p className="text-sm text-gray-500">
              Please use your official company email. Personal email addresses are not accepted.
            </p>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="john@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
              <input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Company Inc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Why do you need access?"
              />
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
