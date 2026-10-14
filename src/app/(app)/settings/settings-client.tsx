"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Shield, Users, Building2, ChevronDown, ChevronRight, Check, KeyRound, Smartphone, Mail, Key, Copy, RefreshCw } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/modal";
import { Field, TextInput, TextArea, Select, FormError } from "@/components/form";
import { PasswordInput } from "@/components/password-input";
import { useToast } from "@/components/toast";
import { PageTabs } from "@/components/page-tabs";
import { PERMISSION_CATEGORIES, type Permission } from "@/lib/permissions";

type Org = { id: string; name: string; slug: string };
type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  roleId: string | null;
  roleName: string;
  createdAt: string;
};
type RoleRow = {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  permissions: string[];
  userCount: number;
};

const TABS = [
  { key: "team", label: "Team", icon: Users },
  { key: "roles", label: "Roles", icon: Shield },
  { key: "org", label: "Organization", icon: Building2 },
  { key: "security", label: "Security", icon: KeyRound },
] as const;
type Tab = (typeof TABS)[number]["key"];

const roleBadgeColor = (name: string) => {
  const n = name.toLowerCase();
  if (n === "admin") return "text-purple-700 bg-purple-50 border-purple-200";
  if (n === "editor") return "text-blue-700 bg-blue-50 border-blue-200";
  if (n === "auditor") return "text-amber-700 bg-amber-50 border-amber-200";
  if (n.includes("compliance")) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (n.includes("risk")) return "text-orange-700 bg-orange-50 border-orange-200";
  if (n.includes("policy")) return "text-teal-700 bg-teal-50 border-teal-200";
  return "text-gray-700 bg-gray-50 border-gray-200";
};

export function SettingsClient({
  organization,
  users,
  roles,
  currentUserId,
  permissions,
}: {
  organization: Org;
  users: UserRow[];
  roles: RoleRow[];
  currentUserId: string;
  permissions: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const permSet = new Set(permissions);

  const canManageUsers = permSet.has("users:manage");
  const canManageOrg = permSet.has("org:manage");
  const canManageRoles = permSet.has("roles:manage");

  const [activeTab, setActiveTab] = useState<Tab>("team");

  // ── Org form ──
  const [orgName, setOrgName] = useState(organization.name);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgSaved, setOrgSaved] = useState(false);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgSaving(true);
    setOrgError(null);
    setOrgSaved(false);
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName.trim() }),
    });
    setOrgSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setOrgError(b?.error ?? "Save failed");
      return;
    }
    setOrgSaved(true);
    startTransition(() => router.refresh());
  }

  // ── User CRUD ──
  const [userModal, setUserModal] = useState<{ mode: "create" | "edit"; row?: UserRow } | null>(null);
  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uRoleId, setURoleId] = useState<string>("");
  const [uSubmitting, setUSubmitting] = useState(false);
  const [uError, setUError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  function openCreateUser() {
    setUserModal({ mode: "create" });
    setUEmail("");
    setUName("");
    setUPassword("");
    setURoleId(roles.find((r) => r.name === "Viewer")?.id ?? "");
    setUError(null);
  }
  function openEditUser(row: UserRow) {
    setUserModal({ mode: "edit", row });
    setUEmail(row.email);
    setUName(row.name);
    setUPassword("");
    setURoleId(row.roleId ?? "");
    setUError(null);
  }

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userModal) return;
    setUSubmitting(true);
    setUError(null);
    let res: Response;
    if (userModal.mode === "create") {
      res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: uEmail.trim(),
          name: uName.trim(),
          password: uPassword,
          roleId: uRoleId || undefined,
        }),
      });
    } else {
      const payload: Record<string, unknown> = { name: uName.trim(), roleId: uRoleId || null };
      if (uPassword) payload.password = uPassword;
      res = await fetch(`/api/users/${userModal.row!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setUSubmitting(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setUError(b?.error ?? "Save failed");
      return;
    }
    toast.success(userModal.mode === "create" ? "User created." : "User updated.");
    setUserModal(null);
    startTransition(() => router.refresh());
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    const t = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/users/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Delete failed");
      return;
    }
    toast.success(`Removed ${t.name}.`);
    startTransition(() => router.refresh());
  }

  // ── Role CRUD ──
  const [roleModal, setRoleModal] = useState<{ mode: "create" | "edit"; row?: RoleRow } | null>(null);
  const [rName, setRName] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rPerms, setRPerms] = useState<Set<string>>(new Set());
  const [rSubmitting, setRSubmitting] = useState(false);
  const [rError, setRError] = useState<string | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRow | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  function openCreateRole() {
    setRoleModal({ mode: "create" });
    setRName("");
    setRDesc("");
    setRPerms(new Set());
    setRError(null);
    setExpandedCategories(new Set());
  }
  function openEditRole(row: RoleRow) {
    setRoleModal({ mode: "edit", row });
    setRName(row.name);
    setRDesc(row.description);
    setRPerms(new Set(row.permissions));
    setRError(null);
    setExpandedCategories(new Set(PERMISSION_CATEGORIES.map((c) => c.label)));
  }

  function togglePerm(perm: string) {
    setRPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }

  function toggleCategory(label: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function toggleAllInCategory(category: typeof PERMISSION_CATEGORIES[number]) {
    const allPerms = category.permissions.map((p) => p.key);
    const allChecked = allPerms.every((p) => rPerms.has(p));
    setRPerms((prev) => {
      const next = new Set(prev);
      for (const p of allPerms) {
        if (allChecked) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  }

  async function submitRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleModal) return;
    setRSubmitting(true);
    setRError(null);
    let res: Response;
    const body = { name: rName.trim(), description: rDesc.trim(), permissions: [...rPerms] };
    if (roleModal.mode === "create") {
      res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`/api/roles/${roleModal.row!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setRSubmitting(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setRError(b?.error ?? "Save failed");
      return;
    }
    toast.success(roleModal.mode === "create" ? "Role created." : "Role updated.");
    setRoleModal(null);
    startTransition(() => router.refresh());
  }

  async function confirmDeleteRole() {
    if (!deleteRoleTarget) return;
    const t = deleteRoleTarget;
    setDeleteRoleTarget(null);
    const res = await fetch(`/api/roles/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b?.error ?? "Delete failed");
      return;
    }
    toast.success(`Deleted role "${t.name}".`);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your organization, team, and roles.
        </p>
      </div>

      <PageTabs tabs={[...TABS]} activeTab={activeTab} onTabChange={(k) => setActiveTab(k as Tab)} />

      {/* ── Team Tab ── */}
      {activeTab === "team" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold leading-none">Team members</h2>
            {canManageUsers && (
              <button className="btn-primary" onClick={openCreateUser}>
                <Plus className="h-4 w-4 mr-2" />
                Add user
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Name</th>
                  <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Email</th>
                  <th className="h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground">Role</th>
                  {canManageUsers && <th className="h-10 px-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {u.name}
                      {u.id === currentUserId && (
                        <span className="ml-2 text-xs text-gray-400">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`badge ${roleBadgeColor(u.roleName)}`}>
                        {u.roleName}
                      </span>
                    </td>
                    {canManageUsers && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditUser(u)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label="Edit user"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {u.id !== currentUserId && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Roles Tab ── */}
      {activeTab === "roles" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold leading-none">Roles &amp; Permissions</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Built-in roles ship with the platform. Create custom roles for your team&apos;s workflow.
              </p>
            </div>
            {canManageRoles && (
              <button className="btn-primary" onClick={openCreateRole}>
                <Plus className="h-4 w-4 mr-2" />
                Create role
              </button>
            )}
          </div>
          <div className="space-y-3">
            {roles.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${roleBadgeColor(r.name)}`}>
                      {r.name}
                    </span>
                    {r.isBuiltIn && (
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                        Built-in
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{r.description}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {r.permissions.length} permissions · {r.userCount} user{r.userCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {canManageRoles && (
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => openEditRole(r)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Edit role"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!r.isBuiltIn && r.userCount === 0 && (
                      <button
                        onClick={() => setDeleteRoleTarget(r)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete role"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Organization Tab ── */}
      {activeTab === "org" && (
        <div className="space-y-6">
        <div className="card">
          <h2 className="font-semibold leading-none mb-4">Organization</h2>
          <form onSubmit={saveOrg} className="space-y-4 max-w-md">
            <FormError message={orgError} />
            {orgSaved && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Saved.
              </p>
            )}
            <Field label="Name" htmlFor="orgName">
              <TextInput
                id="orgName"
                required
                disabled={!canManageOrg}
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  setOrgSaved(false);
                }}
              />
            </Field>
            <Field label="Slug" htmlFor="orgSlug" hint="Read-only.">
              <TextInput id="orgSlug" value={organization.slug} disabled />
            </Field>
            {canManageOrg && (
              <div>
                <button type="submit" disabled={orgSaving} className="btn-primary">
                  {orgSaving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </form>
        </div>
        {canManageOrg && <RemindersCard toast={toast} />}
        </div>
      )}

      {/* ── Security Tab ── */}
      {activeTab === "security" && (
        <SecurityTab canManageOrg={canManageOrg} toast={toast} />
      )}

      {/* ── User Modal ── */}
      <Modal
        open={!!userModal}
        onClose={() => setUserModal(null)}
        title={userModal?.mode === "create" ? "Add user" : "Edit user"}
        size="md"
      >
        <form onSubmit={submitUser} className="space-y-4">
          <FormError message={uError} />
          <Field label="Email" htmlFor="uEmail">
            <TextInput
              id="uEmail"
              type="email"
              required
              disabled={userModal?.mode === "edit"}
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
            />
          </Field>
          <Field label="Name" htmlFor="uName">
            <TextInput
              id="uName"
              required
              value={uName}
              onChange={(e) => setUName(e.target.value)}
            />
          </Field>
          <Field
            label={userModal?.mode === "create" ? "Password" : "New password"}
            htmlFor="uPassword"
            hint={userModal?.mode === "edit" ? "Leave blank to keep the current password. Min 8 characters." : "Min 8 characters."}
          >
            <PasswordInput
              id="uPassword"
              required={userModal?.mode === "create"}
              minLength={8}
              value={uPassword}
              onChange={(e) => setUPassword(e.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="uRoleId">
            <Select
              id="uRoleId"
              value={uRoleId}
              onChange={(e) => setURoleId(e.target.value)}
            >
              <option value="">— Select a role —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.isBuiltIn ? "" : " (custom)"} — {r.permissions.length} permissions
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUserModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={uSubmitting} className="btn-primary">
              {uSubmitting ? "Saving…" : userModal?.mode === "create" ? "Create" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Role Modal ── */}
      <Modal
        open={!!roleModal}
        onClose={() => setRoleModal(null)}
        title={roleModal?.mode === "create" ? "Create role" : `Edit role: ${roleModal?.row?.name ?? ""}`}
        size="lg"
      >
        <form onSubmit={submitRole} className="space-y-4">
          <FormError message={rError} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role name" htmlFor="rName">
              <TextInput
                id="rName"
                required
                disabled={roleModal?.row?.isBuiltIn && roleModal.mode === "edit"}
                value={rName}
                onChange={(e) => setRName(e.target.value)}
              />
            </Field>
            <Field label="Description" htmlFor="rDesc">
              <TextInput
                id="rDesc"
                value={rDesc}
                onChange={(e) => setRDesc(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Permissions ({rPerms.size} selected)
            </p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {PERMISSION_CATEGORIES.map((cat) => {
                const isExpanded = expandedCategories.has(cat.label);
                const allPerms = cat.permissions.map((p) => p.key);
                const checkedCount = allPerms.filter((p) => rPerms.has(p)).length;
                const allChecked = checkedCount === allPerms.length;

                return (
                  <div key={cat.label}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat.label)}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="font-medium text-gray-700">{cat.label}</span>
                        <span className="text-xs text-gray-400">
                          {checkedCount}/{allPerms.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAllInCategory(cat);
                        }}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                      >
                        {allChecked ? "Deselect all" : "Select all"}
                      </button>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-1">
                        {cat.permissions.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-start gap-3 cursor-pointer rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
                          >
                            <div className="pt-0.5">
                              <div
                                onClick={() => togglePerm(perm.key)}
                                className={`h-4 w-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                                  rPerms.has(perm.key)
                                    ? "bg-brand-600 border-brand-600"
                                    : "border-gray-300 bg-white"
                                }`}
                              >
                                {rPerms.has(perm.key) && (
                                  <Check className="h-3 w-3 text-white" />
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1" onClick={() => togglePerm(perm.key)}>
                              <p className="text-sm text-gray-700">{perm.label}</p>
                              <p className="text-xs text-gray-400">{perm.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRoleModal(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={rSubmitting} className="btn-primary">
              {rSubmitting ? "Saving…" : roleModal?.mode === "create" ? "Create role" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete dialogs ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteUser}
        title="Delete user"
        message={`Delete ${deleteTarget?.name} (${deleteTarget?.email})? They will lose access immediately.`}
      />
      <ConfirmDialog
        open={!!deleteRoleTarget}
        onClose={() => setDeleteRoleTarget(null)}
        onConfirm={confirmDeleteRole}
        title="Delete role"
        message={`Delete the "${deleteRoleTarget?.name}" role? This cannot be undone.`}
      />
    </div>
  );
}

function SecurityTab({ canManageOrg, toast }: { canManageOrg: boolean; toast: ReturnType<typeof useToast> }) {
  const [mfaStatus, setMfaStatus] = useState<any>(null);
  const [orgMfaRequired, setOrgMfaRequired] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [enforceSaving, setEnforceSaving] = useState(false);

  const [setupMode, setSetupMode] = useState<"totp" | "email" | null>(null);
  const [totpData, setTotpData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [emailSetupSent, setEmailSetupSent] = useState(false);
  const [emailSetupCode, setEmailSetupCode] = useState("");

  const [disableModal, setDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState("");

  const [regenModal, setRegenModal] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    const [statusRes, secRes] = await Promise.all([
      fetch("/api/mfa/status"),
      fetch("/api/settings/security"),
    ]);
    const s = await statusRes.json();
    const sec = await secRes.json();
    setMfaStatus(s);
    setOrgMfaRequired(sec.mfaRequired ?? false);
    setApprovalRequired(sec.controlApprovalRequired ?? true);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function toggleApproval() {
    setApprovalSaving(true);
    const res = await fetch("/api/settings/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controlApprovalRequired: !approvalRequired }),
    });
    if (res.ok) {
      setApprovalRequired(!approvalRequired);
      toast.success(approvalRequired ? "Control owners can now close controls themselves" : "Closing a control now needs a reviewer's approval");
    }
    setApprovalSaving(false);
  }

  async function toggleOrgEnforce() {
    setEnforceSaving(true);
    const res = await fetch("/api/settings/security", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaRequired: !orgMfaRequired }),
    });
    if (res.ok) {
      setOrgMfaRequired(!orgMfaRequired);
      toast.success(orgMfaRequired ? "MFA enforcement disabled" : "MFA enforcement enabled");
    }
    setEnforceSaving(false);
  }

  async function startTotpSetup() {
    setSetupMode("totp");
    setSetupError("");
    setSetupLoading(true);
    const res = await fetch("/api/mfa/setup/totp", { method: "POST" });
    const data = await res.json();
    setTotpData(data);
    setSetupLoading(false);
  }

  async function verifyTotpSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupLoading(true);
    setSetupError("");
    const res = await fetch("/api/mfa/setup/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode }),
    });
    const data = await res.json();
    setSetupLoading(false);
    if (data.recoveryCodes) {
      setRecoveryCodes(data.recoveryCodes);
      setSetupMode(null);
      setTotpData(null);
      setTotpCode("");
      loadStatus();
    } else {
      setSetupError(data.error || "Verification failed");
    }
  }

  async function startEmailSetup() {
    setSetupMode("email");
    setSetupError("");
    setSetupLoading(true);
    const res = await fetch("/api/mfa/setup/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) setEmailSetupSent(true);
    setSetupLoading(false);
  }

  async function verifyEmailSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupLoading(true);
    setSetupError("");
    const res = await fetch("/api/mfa/setup/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: emailSetupCode }),
    });
    const data = await res.json();
    setSetupLoading(false);
    if (data.recoveryCodes) {
      setRecoveryCodes(data.recoveryCodes);
      setSetupMode(null);
      setEmailSetupSent(false);
      setEmailSetupCode("");
      loadStatus();
    } else {
      setSetupError(data.error || "Verification failed");
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setDisableLoading(true);
    setDisableError("");
    const res = await fetch("/api/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword }),
    });
    const data = await res.json();
    setDisableLoading(false);
    if (data.success) {
      setDisableModal(false);
      setDisablePassword("");
      toast.success("MFA disabled");
      loadStatus();
    } else {
      setDisableError(data.error || "Failed");
    }
  }

  async function regenerateCodes(e: React.FormEvent) {
    e.preventDefault();
    setRegenLoading(true);
    const res = await fetch("/api/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: regenPassword }),
    });
    const data = await res.json();
    setRegenLoading(false);
    if (data.recoveryCodes) {
      setRecoveryCodes(data.recoveryCodes);
      setRegenModal(false);
      setRegenPassword("");
      toast.success("Recovery codes regenerated");
    }
  }

  if (!mfaStatus) return <div className="card text-sm text-gray-400">Loading...</div>;

  const methodLabel: Record<string, string> = {
    TOTP: "Authenticator App",
    EMAIL_OTP: "Email OTP",
    WEBAUTHN: "Security Key (FIDO2)",
  };

  return (
    <div className="space-y-6">
      {/* Org enforcement */}
      {canManageOrg && (
        <div className="card">
          <h2 className="font-semibold leading-none mb-2">Organization Policy</h2>
          <p className="text-sm text-gray-500 mb-4">Require all users to set up MFA before accessing the platform.</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={orgMfaRequired}
              onClick={toggleOrgEnforce}
              disabled={enforceSaving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                orgMfaRequired ? "bg-brand-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  orgMfaRequired ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm font-medium text-gray-700">
              Require MFA for all users
            </span>
          </label>
          <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              role="switch"
              aria-checked={approvalRequired}
              onClick={toggleApproval}
              disabled={approvalSaving}
              className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                approvalRequired ? "bg-brand-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  approvalRequired ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span>
              <span className="block text-sm font-medium text-gray-700">Require approval to close controls</span>
              <span className="block text-xs text-gray-500">
                Owners submit controls with evidence; someone with &ldquo;Review evidence&rdquo; who isn&apos;t the owner approves them.
                Turn off to let owners close their own controls.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Recovery codes display */}
      {recoveryCodes && (
        <div className="card border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold leading-none">Recovery Codes</h2>
            <button
              onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join("\n"));
                toast.success("Copied to clipboard");
              }}
              className="btn-secondary text-xs py-1 px-2"
            >
              <Copy className="h-3.5 w-3.5 mr-1 inline" /> Copy
            </button>
          </div>
          <p className="text-sm text-amber-800 mb-3">
            Save these codes in a secure location. Each code can only be used once.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code, i) => (
              <div key={i} className="font-mono text-sm bg-white rounded px-3 py-1.5 text-center border border-amber-200">
                {code}
              </div>
            ))}
          </div>
          <button
            onClick={() => setRecoveryCodes(null)}
            className="mt-4 text-sm text-amber-700 hover:text-amber-900"
          >
            I&apos;ve saved my codes
          </button>
        </div>
      )}

      {/* Personal MFA */}
      <div className="card">
        <h2 className="font-semibold leading-none mb-2">Multi-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-4">
          {mfaStatus.mfaEnabled
            ? `MFA is enabled using ${methodLabel[mfaStatus.mfaMethod] || mfaStatus.mfaMethod}.`
            : "Add an extra layer of security to your account."}
        </p>

        {mfaStatus.mfaEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/50 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {methodLabel[mfaStatus.mfaMethod] || mfaStatus.mfaMethod}
                </div>
                <div className="text-xs text-gray-500">Active</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setRegenModal(true)}
                className="btn-secondary text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1 inline" /> Regenerate recovery codes
              </button>
              {!mfaStatus.orgMfaRequired && (
                <button
                  onClick={() => { setDisableModal(true); setDisableError(""); setDisablePassword(""); }}
                  className="text-xs text-red-600 hover:text-red-700 px-3 py-1.5"
                >
                  Disable MFA
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* TOTP setup */}
            {setupMode === "totp" && totpData ? (
              <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-3">Scan this QR code with your authenticator app:</p>
                  <img src={totpData.qrCode} alt="TOTP QR Code" className="mx-auto w-48 h-48" />
                  <p className="mt-2 text-xs text-gray-400 font-mono break-all">{totpData.secret}</p>
                </div>
                <form onSubmit={verifyTotpSetup} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Enter the 6-digit code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="input text-center text-lg tracking-[0.3em] font-mono"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>
                  {setupError && <p className="text-sm text-red-600">{setupError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={setupLoading || totpCode.length < 6} className="btn-primary">
                      {setupLoading ? "Verifying..." : "Verify & Enable"}
                    </button>
                    <button type="button" onClick={() => { setSetupMode(null); setTotpData(null); }} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : setupMode === "email" ? (
              <div className="rounded-lg border border-gray-200 p-4 space-y-4">
                {!emailSetupSent ? (
                  <p className="text-sm text-gray-500">Sending verification code...</p>
                ) : (
                  <form onSubmit={verifyEmailSetup} className="space-y-3">
                    <p className="text-sm text-gray-600">A verification code has been sent to your email.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Enter the 6-digit code</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={emailSetupCode}
                        onChange={(e) => setEmailSetupCode(e.target.value.replace(/\D/g, ""))}
                        className="input text-center text-lg tracking-[0.3em] font-mono"
                        placeholder="000000"
                        autoFocus
                      />
                    </div>
                    {setupError && <p className="text-sm text-red-600">{setupError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={setupLoading || emailSetupCode.length < 6} className="btn-primary">
                        {setupLoading ? "Verifying..." : "Verify & Enable"}
                      </button>
                      <button type="button" onClick={() => { setSetupMode(null); setEmailSetupSent(false); }} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  onClick={startTotpSetup}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition text-left"
                >
                  <Smartphone className="h-5 w-5 text-brand-600 shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Authenticator App</div>
                    <div className="text-xs text-gray-500">Google Authenticator, Authy, etc.</div>
                  </div>
                </button>
                <button
                  onClick={startEmailSetup}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition text-left"
                >
                  <Mail className="h-5 w-5 text-brand-600 shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Email OTP</div>
                    <div className="text-xs text-gray-500">Code sent to your email</div>
                  </div>
                </button>
                <button
                  onClick={async () => {
                    const { startRegistration } = await import("@simplewebauthn/browser");
                    setSetupLoading(true);
                    try {
                      const optRes = await fetch("/api/mfa/setup/webauthn/register-options", { method: "POST" });
                      const options = await optRes.json();
                      const credential = await startRegistration({ optionsJSON: options });
                      const regRes = await fetch("/api/mfa/setup/webauthn/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ credential }),
                      });
                      const data = await regRes.json();
                      if (data.recoveryCodes) setRecoveryCodes(data.recoveryCodes);
                      if (data.success) { toast.success("Security key registered"); loadStatus(); }
                    } catch (err: any) {
                      toast.error(err.message || "WebAuthn setup failed");
                    }
                    setSetupLoading(false);
                  }}
                  disabled={setupLoading}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition text-left"
                >
                  <Key className="h-5 w-5 text-brand-600 shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900 text-sm">Security Key</div>
                    <div className="text-xs text-gray-500">FIDO2 / WebAuthn</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disable MFA modal */}
      <Modal open={disableModal} onClose={() => setDisableModal(false)} title="Disable MFA" size="sm">
        <form onSubmit={disableMfa} className="space-y-4">
          <p className="text-sm text-gray-600">Enter your password to confirm disabling MFA.</p>
          {disableError && <p className="text-sm text-red-600">{disableError}</p>}
          <Field label="Password" htmlFor="disablePw">
            <PasswordInput
              id="disablePw"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDisableModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={disableLoading} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {disableLoading ? "Disabling..." : "Disable MFA"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Regen codes modal */}
      <Modal open={regenModal} onClose={() => setRegenModal(false)} title="Regenerate Recovery Codes" size="sm">
        <form onSubmit={regenerateCodes} className="space-y-4">
          <p className="text-sm text-gray-600">This will invalidate your current recovery codes. Enter your password to continue.</p>
          <Field label="Password" htmlFor="regenPw">
            <PasswordInput
              id="regenPw"
              value={regenPassword}
              onChange={(e) => setRegenPassword(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRegenModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={regenLoading} className="btn-primary">
              {regenLoading ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Evidence reminders for open audit-period slots (weekly, then daily as a period closes).
function RemindersCard({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [cfg, setCfg] = useState<{ remindersEnabled: boolean; reminderWeekday: number; reminderFinalDays: number; sendHourUtc: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/reminders").then((r) => (r.ok ? r.json() : null)).then(setCfg).catch(() => setCfg(null));
  }, []);

  if (!cfg) return null;
  const sendTime = new Date(Date.UTC(2000, 0, 1, cfg.sendHourUtc)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remindersEnabled: cfg.remindersEnabled,
        reminderWeekday: cfg.reminderWeekday,
        reminderFinalDays: cfg.reminderFinalDays,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return setError(b?.error ?? "Couldn't save reminder settings");
    }
    toast.success("Reminder settings saved.");
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch("/api/settings/reminders", { method: "POST" });
    setRunning(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(b?.error ?? "Couldn't send reminders");
    toast.success(
      b.sent > 0
        ? `Sent ${b.sent} reminder${b.sent === 1 ? "" : "s"}.`
        : b.skipped > 0 ? "Everyone with open evidence has already had today's reminder." : "Nobody has open evidence to be reminded about today."
    );
  }

  return (
    <div className="card">
      <h2 className="font-semibold leading-none">Evidence reminders</h2>
      <p className="mt-1.5 text-sm text-gray-500">
        Emails control owners about evidence still open in an audit period, and reviewers about submissions waiting for them.
      </p>
      <form onSubmit={save} className="mt-4 max-w-md space-y-4">
        <FormError message={error} />
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={cfg.remindersEnabled}
            onChange={(e) => setCfg({ ...cfg, remindersEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
          />
          <span className="text-sm font-medium text-gray-700">Send evidence reminders</span>
        </label>
        <div className={`grid grid-cols-2 gap-4 ${cfg.remindersEnabled ? "" : "pointer-events-none opacity-50"}`}>
          <Field label="Weekly reminder on" htmlFor="remWeekday">
            <Select id="remWeekday" value={cfg.reminderWeekday} onChange={(e) => setCfg({ ...cfg, reminderWeekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Daily in the final" htmlFor="remFinal" hint="days before a period closes">
            <TextInput
              id="remFinal"
              type="number"
              min={1}
              max={30}
              value={cfg.reminderFinalDays}
              onChange={(e) => setCfg({ ...cfg, reminderFinalDays: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          Reminders go out around {sendTime} your time ({String(cfg.sendHourUtc).padStart(2, "0")}:00 UTC), at most one per person per day.
        </p>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={runNow} disabled={running || !cfg.remindersEnabled} className="btn-secondary">
            {running ? "Sending…" : "Send reminders now"}
          </button>
        </div>
      </form>
    </div>
  );
}
