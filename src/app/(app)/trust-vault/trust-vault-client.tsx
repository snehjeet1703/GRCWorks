"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings, Award, FileText, Globe, Users, Plus, Trash2, Edit2,
  CheckCircle, XCircle, Clock, ExternalLink, Copy, Eye, Download,
  Shield, Link2, ListChecks, ImageUp, Sparkles,
} from "lucide-react";
import { TrustControlIcon } from "@/components/trust-control-icon";
import { PageTabs, type TabDef } from "@/components/page-tabs";
import { Modal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { FrameworkBadge } from "@/components/framework-badge";

const TABS: TabDef[] = [
  { key: "settings", label: "Settings", icon: Settings },
  { key: "badges", label: "Compliance Badges", icon: Award },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "controls", label: "Controls", icon: ListChecks },
  { key: "subprocessors", label: "Sub-processors", icon: Globe },
  { key: "requests", label: "Access Requests", icon: Users },
  { key: "nda", label: "NDA", icon: Shield },
  { key: "grc", label: "GRC Links", icon: Link2 },
];

type Config = {
  id: string;
  enabled: boolean;
  heroTitle: string;
  heroDescription: string;
  primaryColor: string;
  showCompliance: boolean;
  showDocuments: boolean;
  showControls: boolean;
  showSubprocessors: boolean;
  requireNda: boolean;
  logoStorageKey: string | null;
};

type TrustControl = {
  id: string;
  category: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
};

type Badge = {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  enabled: boolean;
  sortOrder: number;
  frameworkId: string | null;
};

type Doc = {
  id: string;
  name: string;
  description: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  visibility: "PUBLIC" | "ACCESS_REQUIRED";
  permission: "VIEW_ONLY" | "DOWNLOADABLE";
  enabled: boolean;
  sortOrder: number;
  version: number;
  validUntil: string | null;
  ownerId: string | null;
};

type SubProcessor = {
  id: string;
  name: string;
  purpose: string;
  location: string;
  website: string;
  enabled: boolean;
  sortOrder: number;
};

type Permission = "VIEW_ONLY" | "DOWNLOADABLE";
const VIEWABLE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

type Expiry = 7 | 15 | 30 | 60 | null;
const EXPIRY_OPTIONS: { value: Expiry; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 15, label: "15 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: null, label: "Always" },
];

// Recovers the duration an existing link was approved for, so a reissued link keeps it.
function approvedExpiry(r: AccessRequest): Expiry {
  if (!r.tokenExpiresAt) return null;
  const days = (new Date(r.tokenExpiresAt).getTime() - new Date(r.reviewedAt ?? r.createdAt).getTime()) / 86400000;
  const fixed = [7, 15, 30, 60] as const;
  return fixed.reduce<number>((best, d) => (Math.abs(d - days) < Math.abs(best - days) ? d : best), fixed[0]) as Expiry;
}

type AccessRequest = {
  id: string;
  email: string;
  name: string;
  company: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  linkIssued: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
  documentAccess: { documentId: string; permission: Permission; document: { name: string } }[];
};

export function TrustVaultClient({ canManage, orgSlug }: { canManage: boolean; orgSlug: string }) {
  const [tab, setTab] = useState("settings");
  const toast = useToast();

  const [config, setConfig] = useState<Config | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [subs, setSubs] = useState<SubProcessor[]>([]);
  const [controls, setControls] = useState<TrustControl[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, b, d, s, r, ctl] = await Promise.all([
        fetch("/api/trust-vault/config").then((r) => r.json()),
        fetch("/api/trust-vault/badges").then((r) => r.json()),
        fetch("/api/trust-vault/documents").then((r) => r.json()),
        fetch("/api/trust-vault/subprocessors").then((r) => r.json()),
        fetch("/api/trust-vault/access-requests").then((r) => r.json()),
        fetch("/api/trust-vault/controls").then((r) => r.json()),
      ]);
      setConfig(c);
      setBadges(b);
      setDocs(d);
      setSubs(s);
      setRequests(Array.isArray(r) ? r : []);
      setControls(Array.isArray(ctl) ? ctl : []);
    } catch {
      toast.error("Failed to load trust vault data");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trust Vault</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your public-facing trust & compliance portal
          </p>
        </div>
        {config?.enabled && orgSlug && (
          <a
            href={`/trust/${orgSlug}`}
            target="_blank"
            rel="noopener"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" /> Preview Trust Page
          </a>
        )}
      </div>

      <PageTabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {tab === "settings" && config && (
        <SettingsTab config={config} canManage={canManage} onSave={load} toast={toast} />
      )}
      {tab === "badges" && (
        <BadgesTab badges={badges} canManage={canManage} onRefresh={load} toast={toast} />
      )}
      {tab === "documents" && (
        <DocumentsTab docs={docs} canManage={canManage} onRefresh={load} toast={toast} />
      )}
      {tab === "controls" && (
        <ControlsTab controls={controls} canManage={canManage} onRefresh={load} toast={toast} />
      )}
      {tab === "subprocessors" && (
        <SubprocessorsTab subs={subs} canManage={canManage} onRefresh={load} toast={toast} />
      )}
      {tab === "requests" && (
        <AccessRequestsTab
          orgSlug={orgSlug}
          requests={requests}
          docs={docs}
          canManage={canManage}
          onRefresh={load}
          toast={toast}
        />
      )}
      {tab === "nda" && (
        <NdaTab canManage={canManage} toast={toast} />
      )}
      {tab === "grc" && (
        <GrcTab docs={docs} canManage={canManage} toast={toast} />
      )}
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────

function SettingsTab({ config, canManage, onSave, toast }: {
  config: Config; canManage: boolean; onSave: () => void; toast: any;
}) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/trust-vault/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          heroTitle: form.heroTitle,
          heroDescription: form.heroDescription,
          primaryColor: form.primaryColor,
          showCompliance: form.showCompliance,
          showDocuments: form.showDocuments,
          showControls: form.showControls,
          showSubprocessors: form.showSubprocessors,
          requireNda: form.requireNda,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Settings saved");
      onSave();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-gray-900">Trust Vault Status</h3>
            <p className="text-sm text-gray-500">Enable or disable your public trust page</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              disabled={!canManage}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-gray-200 peer-checked:bg-brand-600 peer-focus:ring-4 peer-focus:ring-brand-100 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>

      <LogoCard hasLogo={!!config.logoStorageKey} canManage={canManage} onChange={onSave} toast={toast} />

      <div className="rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className="font-medium text-gray-900">Hero Section</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={form.heroTitle}
            onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
            disabled={!canManage}
            placeholder="Your Company Name"
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.heroDescription}
            onChange={(e) => setForm({ ...form, heroDescription: e.target.value })}
            disabled={!canManage}
            rows={4}
            placeholder="Describe your company's commitment to security and compliance..."
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              disabled={!canManage}
              className="h-10 w-14 cursor-pointer rounded border border-gray-300"
            />
            <span className="text-sm text-gray-500">{form.primaryColor}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-6 space-y-3">
        <h3 className="font-medium text-gray-900">Sections Visibility</h3>
        {[
          { key: "showCompliance" as const, label: "Compliance Badges" },
          { key: "showDocuments" as const, label: "Documents" },
          { key: "showControls" as const, label: "Controls" },
          { key: "showSubprocessors" as const, label: "Sub-processors" },
        ].map((item) => (
          <label key={item.key} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form[item.key]}
              onChange={(e) => setForm({ ...form, [item.key]: e.target.checked })}
              disabled={!canManage}
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
            />
            <span className="text-sm text-gray-700">{item.label}</span>
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 p-6 space-y-3">
        <h3 className="font-medium text-gray-900">NDA Requirement</h3>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.requireNda}
            onChange={(e) => setForm({ ...form, requireNda: e.target.checked })}
            disabled={!canManage}
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
          />
          <span className="text-sm text-gray-700">Require NDA acceptance before viewing restricted documents</span>
        </label>
      </div>

      {canManage && (
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      )}
    </div>
  );
}

function LogoCard({ hasLogo, canManage, onChange, toast }: {
  hasLogo: boolean; canManage: boolean; onChange: () => void; toast: any;
}) {
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(() => Date.now());

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/trust-vault/logo", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setVersion(Date.now());
      toast.success("Logo updated");
      onChange();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/trust-vault/logo", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Logo removed");
      onChange();
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <h3 className="font-medium text-gray-900">Logo</h3>
      <p className="mb-4 text-sm text-gray-500">Shown in the trust page header. PNG, JPEG or WebP, up to 1MB.</p>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-2">
          {hasLogo ? (
            <img src={`/api/trust-vault/logo?v=${version}`} alt="Current logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">No logo</span>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <label className={`btn-secondary btn-sm cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
              <ImageUp className="h-4 w-4" /> {hasLogo ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
            </label>
            {hasLogo && (
              <button type="button" onClick={remove} disabled={busy} className="btn-ghost btn-sm text-red-600">
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badges Tab ──────────────────────────────────────────────

function BadgesTab({ badges, canManage, onRefresh, toast }: {
  badges: Badge[]; canManage: boolean; onRefresh: () => void; toast: any;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Badge | null>(null);
  const [deleting, setDeleting] = useState<Badge | null>(null);
  const [form, setForm] = useState({ name: "", description: "", iconUrl: "", enabled: true, sortOrder: 0 });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", iconUrl: "", enabled: true, sortOrder: 0 });
    setShowModal(true);
  };
  const openEdit = (b: Badge) => {
    setEditing(b);
    setForm({ name: b.name, description: b.description, iconUrl: b.iconUrl, enabled: b.enabled, sortOrder: b.sortOrder });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const url = editing ? `/api/trust-vault/badges/${editing.id}` : "/api/trust-vault/badges";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Badge updated" : "Badge created");
      setShowModal(false);
      onRefresh();
    } catch {
      toast.error("Failed to save badge");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/trust-vault/badges/${deleting.id}`, { method: "DELETE" });
      toast.success("Badge deleted");
      setDeleting(null);
      onRefresh();
    } catch {
      toast.error("Failed to delete badge");
    }
  };

  return (
    <div>
      {canManage && (
        <button onClick={openCreate} className="btn-primary mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Badge
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badges.map((b) => (
          <div key={b.id} className="rounded-lg border border-gray-200 p-4 flex items-start gap-3">
            {b.iconUrl ? (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
                <img src={b.iconUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              </div>
            ) : (
              <FrameworkBadge name={b.name} size={48} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">{b.name}</span>
                {b.enabled ? (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />
                )}
              </div>
              {b.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{b.description}</p>}
              {canManage && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => openEdit(b)} className="text-xs text-brand-600 hover:text-brand-800">Edit</button>
                  <button onClick={() => setDeleting(b)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {badges.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No compliance badges yet. Add one to showcase your certifications.
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Badge" : "Add Badge"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="SOC 2 Type II" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon URL</label>
            <input value={form.iconUrl} onChange={(e) => setForm({ ...form, iconUrl: e.target.value })} className="input" placeholder="https://..." />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            <span className="text-sm text-gray-700">Enabled</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={!form.name} className="btn-primary">{editing ? "Update" : "Create"}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete Badge"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────

function DocumentsTab({ docs, canManage, onRefresh, toast }: {
  docs: Doc[]; canManage: boolean; onRefresh: () => void; toast: any;
}) {
  const [uploading, setUploading] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "", visibility: "ACCESS_REQUIRED" as string, permission: "VIEW_ONLY" as string, enabled: true, validUntil: "" });

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", file.name);
      fd.append("category", "General");
      fd.append("visibility", "ACCESS_REQUIRED");
      fd.append("permission", "VIEW_ONLY");
      const res = await fetch("/api/trust-vault/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      toast.success("Document uploaded");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const openEdit = (d: Doc) => {
    setEditDoc(d);
    setEditForm({ name: d.name, description: d.description, category: d.category, visibility: d.visibility, permission: d.permission, enabled: d.enabled, validUntil: d.validUntil ? d.validUntil.slice(0, 10) : "" });
  };

  const saveEdit = async () => {
    if (!editDoc) return;
    try {
      const res = await fetch(`/api/trust-vault/documents/${editDoc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          validUntil: editForm.validUntil ? new Date(editForm.validUntil).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Document updated");
      setEditDoc(null);
      onRefresh();
    } catch {
      toast.error("Failed to update document");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/trust-vault/documents/${deleting.id}`, { method: "DELETE" });
      toast.success("Document deleted");
      setDeleting(null);
      onRefresh();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {canManage && (
        <label className="btn-primary mb-4 inline-flex cursor-pointer items-center gap-2">
          <Plus className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload Document"}
          <input type="file" className="hidden" onChange={upload} disabled={uploading} />
        </label>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Visibility</th>
              <th className="pb-3 font-medium">Permission</th>
              <th className="pb-3 font-medium">Size</th>
              <th className="pb-3 font-medium">Ver</th>
              <th className="pb-3 font-medium">Expires</th>
              <th className="pb-3 font-medium">Status</th>
              {canManage && <th className="pb-3 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-gray-100">
                <td className="py-3 font-medium text-gray-900">{d.name}</td>
                <td className="py-3 text-gray-600">{d.category}</td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${d.visibility === "PUBLIC" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {d.visibility === "PUBLIC" ? <Eye className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                    {d.visibility === "PUBLIC" ? "Public" : "Restricted"}
                  </span>
                </td>
                <td className="py-3 text-gray-600">{d.permission === "DOWNLOADABLE" ? "Download" : "View Only"}</td>
                <td className="py-3 text-gray-500">{fmtSize(d.fileSize)}</td>
                <td className="py-3 text-gray-500">v{d.version || 1}</td>
                <td className="py-3 text-gray-500">
                  {d.validUntil ? (
                    new Date(d.validUntil) < new Date()
                      ? <span className="text-red-600 text-xs font-medium">Expired</span>
                      : new Date(d.validUntil).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
                        ? <span className="text-amber-600 text-xs font-medium">{new Date(d.validUntil).toLocaleDateString()}</span>
                        : <span className="text-xs">{new Date(d.validUntil).toLocaleDateString()}</span>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="py-3">
                  {d.enabled ? (
                    <span className="text-green-600 text-xs font-medium">Active</span>
                  ) : (
                    <span className="text-gray-400 text-xs font-medium">Disabled</span>
                  )}
                </td>
                {canManage && (
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(d)} className="text-brand-600 hover:text-brand-800"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => setDeleting(d)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {docs.length === 0 && <div className="text-center py-12 text-gray-500">No documents uploaded yet.</div>}

      <Modal open={!!editDoc} onClose={() => setEditDoc(null)} title="Edit Document">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
              <select value={editForm.visibility} onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value })} className="input">
                <option value="PUBLIC">Public</option>
                <option value="ACCESS_REQUIRED">Restricted</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permission</label>
              <select value={editForm.permission} onChange={(e) => setEditForm({ ...editForm, permission: e.target.value })} className="input">
                <option value="VIEW_ONLY">View Only</option>
                <option value="DOWNLOADABLE">Downloadable</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
            <input type="date" value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} className="input" />
            <p className="text-xs text-gray-400 mt-1">Leave blank for no expiry</p>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
            <span className="text-sm text-gray-700">Enabled</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditDoc(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveEdit} className="btn-primary">Update</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete Document" message={`Delete "${deleting?.name}"? The file will be permanently removed.`} />
    </div>
  );
}

// ─── Sub-processors Tab ──────────────────────────────────────

function SubprocessorsTab({ subs, canManage, onRefresh, toast }: {
  subs: SubProcessor[]; canManage: boolean; onRefresh: () => void; toast: any;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SubProcessor | null>(null);
  const [deleting, setDeleting] = useState<SubProcessor | null>(null);
  const [form, setForm] = useState({ name: "", purpose: "", location: "", website: "", enabled: true });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", purpose: "", location: "", website: "", enabled: true });
    setShowModal(true);
  };
  const openEdit = (s: SubProcessor) => {
    setEditing(s);
    setForm({ name: s.name, purpose: s.purpose, location: s.location, website: s.website, enabled: s.enabled });
    setShowModal(true);
  };

  const save = async () => {
    try {
      const url = editing ? `/api/trust-vault/subprocessors/${editing.id}` : "/api/trust-vault/subprocessors";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Sub-processor updated" : "Sub-processor added");
      setShowModal(false);
      onRefresh();
    } catch {
      toast.error("Failed to save");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await fetch(`/api/trust-vault/subprocessors/${deleting.id}`, { method: "DELETE" });
      toast.success("Sub-processor deleted");
      setDeleting(null);
      onRefresh();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div>
      {canManage && (
        <button onClick={openCreate} className="btn-primary mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Sub-processor
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subs.map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-brand-600" />
              <span className="font-medium text-gray-900">{s.name}</span>
            </div>
            {s.purpose && <p className="text-xs text-gray-500 mb-1">{s.purpose}</p>}
            {s.location && <p className="text-xs text-gray-400">{s.location}</p>}
            {canManage && (
              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-2">
                <button onClick={() => openEdit(s)} className="text-xs text-brand-600 hover:text-brand-800">Edit</button>
                <button onClick={() => setDeleting(s)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {subs.length === 0 && <div className="text-center py-12 text-gray-500">No sub-processors added yet.</div>}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Sub-processor" : "Add Sub-processor"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="AWS" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="input" placeholder="Cloud infrastructure" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" placeholder="United States" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" placeholder="https://aws.amazon.com" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={!form.name} className="btn-primary">{editing ? "Update" : "Create"}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete Sub-processor" message={`Delete "${deleting?.name}"?`} />
    </div>
  );
}

// ─── Controls Tab ────────────────────────────────────────────

function ControlsTab({ controls, canManage, onRefresh, toast }: {
  controls: TrustControl[]; canManage: boolean; onRefresh: () => void; toast: any;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<TrustControl | null>(null);
  const [deleting, setDeleting] = useState<TrustControl | null>(null);
  const [form, setForm] = useState({ category: "", name: "" });
  const [busy, setBusy] = useState(false);

  const categories = [...new Set(controls.map((c) => c.category))];
  const visibleCount = controls.filter((c) => c.enabled).length;

  const openCreate = (category = "") => {
    setEditing(null);
    setForm({ category, name: "" });
    setShowModal(true);
  };
  const openEdit = (c: TrustControl) => {
    setEditing(c);
    setForm({ category: c.category, name: c.name });
    setShowModal(true);
  };

  const request = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const save = async () => {
    try {
      if (editing) await request(`/api/trust-vault/controls/${editing.id}`, "PUT", form);
      else {
        const sortOrder = Math.max(0, ...controls.map((c) => c.sortOrder)) + 1;
        await request("/api/trust-vault/controls", "POST", { ...form, sortOrder });
      }
      toast.success(editing ? "Control updated" : "Control added");
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggle = async (c: TrustControl) => {
    try {
      await request(`/api/trust-vault/controls/${c.id}`, "PUT", { enabled: !c.enabled });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await request(`/api/trust-vault/controls/${deleting.id}`, "DELETE");
      toast.success("Control deleted");
      setDeleting(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadSuggested = async () => {
    setBusy(true);
    try {
      const { created } = await request("/api/trust-vault/controls/suggested", "POST");
      toast.success(`Added ${created} suggested controls (hidden until you switch them on)`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Security practices shown publicly, grouped by category.{" "}
          {controls.length > 0 && <>{visibleCount} of {controls.length} visible.</>}
        </p>
        {canManage && controls.length > 0 && (
          <button onClick={() => openCreate()} className="btn-primary">
            <Plus className="h-4 w-4" /> Add control
          </button>
        )}
      </div>

      {controls.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 font-medium text-gray-900">No public controls yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            Start from a suggested list of common practices. They&apos;re added hidden: switch on only the ones that are true for your organisation.
          </p>
          {canManage && (
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={loadSuggested} disabled={busy} className="btn-primary">
                <Sparkles className="h-4 w-4" /> {busy ? "Adding…" : "Load suggested controls"}
              </button>
              <button onClick={() => openCreate()} className="btn-secondary">
                <Plus className="h-4 w-4" /> Add manually
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <section key={category} className="rounded-xl border border-gray-200 p-4">
            <header className="mb-3 flex items-center gap-2">
              <TrustControlIcon category={category} className="h-4 w-4 text-gray-500" />
              <h3 className="flex-1 font-medium text-gray-900">{category}</h3>
              {canManage && (
                <button onClick={() => openCreate(category)} className="btn-ghost btn-sm h-7 px-2" aria-label={`Add control to ${category}`}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </header>
            <ul className="divide-y divide-gray-100">
              {controls.filter((c) => c.category === category).map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <span className={`flex-1 text-sm ${c.enabled ? "text-gray-900" : "text-gray-400"}`}>{c.name}</span>
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={c.enabled}
                        aria-label={`${c.enabled ? "Hide" : "Show"} ${c.name} on the public page`}
                        title={c.enabled ? "Visible on the public page" : "Hidden from the public page"}
                        onClick={() => toggle(c)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${c.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${c.enabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                      <button onClick={() => openEdit(c)} className="rounded p-1 text-gray-400 hover:text-gray-700" aria-label={`Edit ${c.name}`}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleting(c)} className="rounded p-1 text-gray-400 hover:text-red-600" aria-label={`Delete ${c.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    !c.enabled && <span className="text-xs text-gray-400">hidden</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit control" : "Add control"}>
        <div className="space-y-4">
          <div>
            <label htmlFor="tc-category" className="mb-1 block text-sm font-medium text-gray-700">Category *</label>
            <input
              id="tc-category"
              list="tc-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input"
              placeholder="e.g. Data Security"
            />
            <datalist id="tc-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="tc-name" className="mb-1 block text-sm font-medium text-gray-700">Control *</label>
            <input
              id="tc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="e.g. Encryption at rest"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={!form.category.trim() || !form.name.trim()} className="btn-primary">
              {editing ? "Update" : "Add"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete control" message={`Delete "${deleting?.name}"?`} />
    </div>
  );
}

// ─── Access Requests Tab ─────────────────────────────────────

function AccessRequestsTab({ orgSlug, requests, docs, canManage, onRefresh, toast }: {
  orgSlug: string; requests: AccessRequest[]; docs: Doc[]; canManage: boolean; onRefresh: () => void; toast: any;
}) {
  const [reviewing, setReviewing] = useState<AccessRequest | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Record<string, Permission>>({});
  const [expiry, setExpiry] = useState<Expiry>(30);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "DENIED">("ALL");
  const [issuedLink, setIssuedLink] = useState<{ email: string; url: string } | null>(null);

  const openReview = (r: AccessRequest) => {
    setReviewing(r);
    setSelectedDocs(Object.fromEntries(r.documentAccess.map((da) => [da.documentId, da.permission])));
    setExpiry(30);
  };

  const submitReview = async (request: AccessRequest, status: "APPROVED" | "DENIED", grants: Record<string, Permission>, expiresInDays: Expiry = 30) => {
    const res = await fetch(`/api/trust-vault/access-requests/${request.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        grants: status === "APPROVED"
          ? Object.entries(grants).map(([documentId, permission]) => ({ documentId, permission }))
          : [],
        ...(status === "APPROVED" ? { expiresInDays } : {}),
      }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    // The server keeps only a hash, so this response is the only time the link is available.
    if (status === "APPROVED" && data.accessToken) {
      setIssuedLink({
        email: request.email,
        url: `${window.location.origin}/trust/${orgSlug}?token=${encodeURIComponent(data.accessToken)}`,
      });
    }
  };

  const review = async (status: "APPROVED" | "DENIED") => {
    if (!reviewing) return;
    try {
      await submitReview(reviewing, status, selectedDocs, expiry);
      toast.success(`Request ${status.toLowerCase()}`);
      setReviewing(null);
      onRefresh();
    } catch {
      toast.error("Failed to update request");
    }
  };

  const reissueLink = async (r: AccessRequest) => {
    if (!confirm(`Issue a new access link for ${r.email}? Their previous link will stop working.`)) return;
    try {
      await submitReview(r, "APPROVED", Object.fromEntries(r.documentAccess.map((da) => [da.documentId, da.permission])), approvedExpiry(r));
      onRefresh();
    } catch {
      toast.error("Failed to issue a new link");
    }
  };

  const filtered = filter === "ALL" ? requests : requests.filter((r) => r.status === filter);
  const pending = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {(["ALL", "PENDING", "APPROVED", "DENIED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            {f === "PENDING" && pending > 0 && <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-[10px]">{pending}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{r.name}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{r.email}</p>
                <p className="text-xs text-gray-400">{r.company} &middot; {new Date(r.createdAt).toLocaleDateString()}</p>
                {r.reason && <p className="text-sm text-gray-600 mt-2">{r.reason}</p>}
                {r.linkIssued && r.status === "APPROVED" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>
                      Access link issued
                      {r.tokenExpiresAt ? <> · expires {new Date(r.tokenExpiresAt).toLocaleDateString()}</> : <> · never expires</>}
                    </span>
                    {canManage && (
                      <button onClick={() => reissueLink(r)} className="font-medium text-brand-600 hover:text-brand-800">
                        New link
                      </button>
                    )}
                  </div>
                )}
                {r.documentAccess.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.documentAccess.map((da) => (
                      <span key={da.documentId} className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                        <FileText className="h-3 w-3 mr-1" />{da.document.name}
                        <span className="ml-1 text-blue-500">· {da.permission === "DOWNLOADABLE" ? "download" : "view only"}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManage && r.status === "PENDING" && (
                <button onClick={() => openReview(r)} className="btn-secondary text-xs">
                  Review
                </button>
              )}
              {canManage && r.status === "APPROVED" && (
                <button onClick={async () => {
                  if (!confirm(`Revoke access for ${r.email}?`)) return;
                  try {
                    const res = await fetch(`/api/trust-vault/access-requests/${r.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "DENIED" }),
                    });
                    if (!res.ok) throw new Error();
                    toast.success("Access revoked");
                    onRefresh();
                  } catch { toast.error("Failed to revoke"); }
                }} className="text-xs text-red-600 hover:text-red-800 font-medium">
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-gray-500">No access requests.</div>}

      <Modal open={!!issuedLink} onClose={() => setIssuedLink(null)} title="Access link">
        {issuedLink && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Send this link to <strong>{issuedLink.email}</strong>. For security it is shown only once; if it&apos;s
              lost, use <em>New link</em> to issue a replacement.
            </p>
            <input readOnly value={issuedLink.url} onFocus={(e) => e.target.select()} aria-label="Access link" className="input font-mono text-xs" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIssuedLink(null)} className="btn-secondary">Done</button>
              <button
                onClick={() => { navigator.clipboard.writeText(issuedLink.url); toast.success("Link copied"); }}
                className="btn-primary"
              >
                <Copy className="h-4 w-4" /> Copy link
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Review Access Request" size="lg">
        {reviewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Name:</span> <span className="font-medium">{reviewing.name}</span></div>
              <div><span className="text-gray-500">Email:</span> <span className="font-medium">{reviewing.email}</span></div>
              <div><span className="text-gray-500">Company:</span> <span className="font-medium">{reviewing.company}</span></div>
              <div><span className="text-gray-500">Requested:</span> <span className="font-medium">{new Date(reviewing.createdAt).toLocaleDateString()}</span></div>
            </div>
            {reviewing.reason && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-1">Reason</p>
                <p className="text-sm text-gray-700">{reviewing.reason}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Grant access to documents:</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {docs.filter((d) => d.visibility === "ACCESS_REQUIRED").map((d) => {
                  const viewable = VIEWABLE_TYPES.has(d.mimeType);
                  const granted = selectedDocs[d.id];
                  return (
                    <div key={d.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                      <label className="flex flex-1 items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!granted}
                          onChange={(e) => {
                            const next = { ...selectedDocs };
                            if (e.target.checked) next[d.id] = viewable ? d.permission : "DOWNLOADABLE";
                            else delete next[d.id];
                            setSelectedDocs(next);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900">{d.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{d.category}</span>
                        </div>
                      </label>
                      {granted && (
                        <select
                          value={granted}
                          onChange={(e) => setSelectedDocs({ ...selectedDocs, [d.id]: e.target.value as Permission })}
                          aria-label={`Access level for ${d.name}`}
                          className="input w-auto py-1 text-xs"
                        >
                          <option value="VIEW_ONLY" disabled={!viewable}>View only{viewable ? "" : " (PDF/image only)"}</option>
                          <option value="DOWNLOADABLE">Download</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
              {docs.filter((d) => d.visibility === "ACCESS_REQUIRED").length === 0 && (
                <p className="text-sm text-gray-400">No restricted documents available.</p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Access expires after:</p>
              <div role="radiogroup" aria-label="Access duration" className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={expiry === o.value}
                    onClick={() => setExpiry(o.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${expiry === o.value ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {expiry === null
                  ? "The link works until you revoke it."
                  : `The link stops working on ${new Date(Date.now() + expiry * 86400000).toLocaleDateString()}. You can issue a new one any time.`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => review("DENIED")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                <XCircle className="h-4 w-4" /> Deny
              </button>
              <button onClick={() => review("APPROVED")} className="btn-primary flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── NDA Tab ────────────────────────────────────────────────

type Nda = { id: string; title: string; content: string; version: number; active: boolean; createdAt: string };

function NdaTab({ canManage, toast }: { canManage: boolean; toast: any }) {
  const [ndas, setNdas] = useState<Nda[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "Non-Disclosure Agreement", content: "" });
  const [saving, setSaving] = useState(false);
  const [viewNda, setViewNda] = useState<Nda | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/trust-vault/nda");
    if (res.ok) setNdas(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error("Title and content are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/trust-vault/nda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("NDA created — previous version deactivated");
      setShowModal(false);
      load();
    } catch { toast.error("Failed to create NDA"); } finally { setSaving(false); }
  };

  const activeNda = ndas.find((n) => n.active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {activeNda
            ? `Active NDA: "${activeNda.title}" (v${activeNda.version})`
            : "No active NDA configured"}
        </p>
        {canManage && (
          <button onClick={() => { setForm({ title: "Non-Disclosure Agreement", content: "" }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> {activeNda ? "New Version" : "Create NDA"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Title</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Version</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Status</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Created</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ndas.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-3 text-gray-900">{n.title}</td>
                <td className="px-4 py-3 text-gray-500">v{n.version}</td>
                <td className="px-4 py-3 align-middle">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${n.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {n.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{new Date(n.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 align-middle">
                  <button onClick={() => setViewNda(n)} className="text-brand-600 hover:underline text-xs">View</button>
                </td>
              </tr>
            ))}
            {ndas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No NDAs created yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal open={showModal} title="Create NDA" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NDA Content</label>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={12} className="input font-mono text-xs" placeholder="Enter the full NDA text..." />
            </div>
            <p className="text-xs text-amber-600">Creating a new NDA will deactivate any previous version. Users who accepted the old version will need to re-accept.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={create} disabled={saving} className="btn-primary">{saving ? "Creating..." : "Create NDA"}</button>
            </div>
          </div>
        </Modal>
      )}

      {viewNda && (
        <Modal open title={`${viewNda.title} (v${viewNda.version})`} onClose={() => setViewNda(null)}>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 max-h-96 overflow-y-auto bg-gray-50 rounded p-4">{viewNda.content}</pre>
        </Modal>
      )}
    </div>
  );
}

// ─── GRC Links Tab ──────────────────────────────────────────

type ControlOption = { id: string; code: string; title: string };

function GrcTab({ docs, canManage, toast }: { docs: Doc[]; canManage: boolean; toast: any }) {
  const [controls, setControls] = useState<ControlOption[]>([]);
  const [docLinks, setDocLinks] = useState<Record<string, string[]>>({});
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadControls = useCallback(async () => {
    const res = await fetch("/api/controls");
    if (res.ok) {
      const data = await res.json();
      setControls(Array.isArray(data) ? data : data.controls || []);
    }
  }, []);

  const loadLinks = useCallback(async () => {
    const links: Record<string, string[]> = {};
    for (const doc of docs) {
      const res = await fetch(`/api/trust-vault/documents/${doc.id}/controls`);
      if (res.ok) {
        const arr: ControlOption[] = await res.json();
        links[doc.id] = arr.map((c) => c.id);
      }
    }
    setDocLinks(links);
  }, [docs]);

  useEffect(() => { loadControls(); loadLinks(); }, [loadControls, loadLinks]);

  const startEdit = (docId: string) => {
    setEditingDoc(docId);
    setSelectedControls(docLinks[docId] || []);
  };

  const saveLinks = async () => {
    if (!editingDoc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trust-vault/documents/${editingDoc}/controls`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlIds: selectedControls }),
      });
      if (!res.ok) throw new Error();
      toast.success("Control links updated");
      setEditingDoc(null);
      loadLinks();
    } catch { toast.error("Failed to update links"); } finally { setSaving(false); }
  };

  const toggleControl = (id: string) => {
    setSelectedControls((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Link trust vault documents to GRC controls for traceability.</p>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Document</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Category</th>
              <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Linked Controls</th>
              {canManage && <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {docs.map((doc) => {
              const linkedIds = docLinks[doc.id] || [];
              const linkedControls = controls.filter((c) => linkedIds.includes(c.id));
              return (
                <tr key={doc.id}>
                  <td className="px-4 py-3 text-gray-900">{doc.name}</td>
                  <td className="px-4 py-3 text-gray-500">{doc.category}</td>
                  <td className="px-4 py-3 align-middle">
                    {linkedControls.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {linkedControls.map((c) => (
                          <span key={c.id} className="inline-flex rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{c.code}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">None</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 align-middle">
                      <button onClick={() => startEdit(doc.id)} className="text-brand-600 hover:underline text-xs flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> Manage
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {docs.length === 0 && (
              <tr><td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-gray-400">No documents to link</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingDoc && (
        <Modal open title={`Link Controls — ${docs.find((d) => d.id === editingDoc)?.name}`} onClose={() => setEditingDoc(null)}>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {controls.length === 0 && <p className="text-sm text-gray-400">No controls found</p>}
            {controls.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-2 py-1 hover:bg-gray-50 rounded">
                <input
                  type="checkbox"
                  checked={selectedControls.includes(c.id)}
                  onChange={() => toggleControl(c.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                <span className="text-sm"><span className="font-medium text-gray-900">{c.code}</span> — <span className="text-gray-600">{c.title}</span></span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
            <button onClick={() => setEditingDoc(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveLinks} disabled={saving} className="btn-primary">{saving ? "Saving..." : `Link ${selectedControls.length} Controls`}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    PENDING: "bg-yellow-50 text-yellow-700",
    APPROVED: "bg-green-50 text-green-700",
    DENIED: "bg-red-50 text-red-700",
  };
  const icons = {
    PENDING: Clock,
    APPROVED: CheckCircle,
    DENIED: XCircle,
  };
  const Icon = icons[status as keyof typeof icons] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles] || "bg-gray-50 text-gray-600"}`}>
      <Icon className="h-3 w-3" />{status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
