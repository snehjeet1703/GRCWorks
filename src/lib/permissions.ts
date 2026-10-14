import type { UserRole } from "@prisma/client";

// ─── Permission Keys ─────────────────────────────────────────
// Every action in the system maps to one of these keys.
// Roles store a subset as their granted permissions.

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: "dashboard:view",

  // Controls
  CONTROLS_READ: "controls:read",
  CONTROLS_WRITE: "controls:write",

  // Risks
  RISKS_READ: "risks:read",
  RISKS_WRITE: "risks:write",

  // Policies
  POLICIES_READ: "policies:read",
  POLICIES_WRITE: "policies:write",
  POLICIES_APPROVE: "policies:approve",

  // Evidence
  EVIDENCE_READ: "evidence:read",
  EVIDENCE_UPLOAD: "evidence:upload",
  EVIDENCE_DELETE: "evidence:delete",
  EVIDENCE_REVIEW: "evidence:review",

  // Findings
  FINDINGS_READ: "findings:read",
  FINDINGS_WRITE: "findings:write",
  FINDINGS_CLOSE: "findings:close",

  // Exceptions
  EXCEPTIONS_READ: "exceptions:read",
  EXCEPTIONS_REQUEST: "exceptions:request",
  EXCEPTIONS_APPROVE: "exceptions:approve",

  // Vendors
  VENDORS_READ: "vendors:read",
  VENDORS_WRITE: "vendors:write",

  // Reports
  REPORTS_EXPORT: "reports:export",

  // Users
  USERS_READ: "users:read",
  USERS_MANAGE: "users:manage",

  // Organization
  ORG_MANAGE: "org:manage",

  // Audit logs
  AUDIT_READ: "audit:read",

  // Frameworks
  FRAMEWORKS_MANAGE: "frameworks:manage",

  // Roles
  ROLES_MANAGE: "roles:manage",

  // Trust Vault
  TRUST_VAULT_READ: "trust_vault:read",
  TRUST_VAULT_MANAGE: "trust_vault:manage",

  // Tasks (everyone sees and updates tasks assigned to them; these cover everyone else's)
  TASKS_READ: "tasks:read",
  TASKS_MANAGE: "tasks:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// ─── Permission Categories (for UI grouping) ─────────────────

export type PermissionCategory = {
  label: string;
  permissions: { key: Permission; label: string; description: string }[];
};

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    label: "Dashboard",
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: "View dashboard", description: "See the main dashboard with metrics and charts" },
    ],
  },
  {
    label: "Controls",
    permissions: [
      { key: PERMISSIONS.CONTROLS_READ, label: "View controls", description: "See control details and statuses" },
      { key: PERMISSIONS.CONTROLS_WRITE, label: "Edit controls", description: "Update control statuses and details" },
    ],
  },
  {
    label: "Risks",
    permissions: [
      { key: PERMISSIONS.RISKS_READ, label: "View risks", description: "See risk register and risk details" },
      { key: PERMISSIONS.RISKS_WRITE, label: "Manage risks", description: "Create, edit, and delete risks" },
    ],
  },
  {
    label: "Policies",
    permissions: [
      { key: PERMISSIONS.POLICIES_READ, label: "View policies", description: "Read policy documents" },
      { key: PERMISSIONS.POLICIES_WRITE, label: "Manage policies", description: "Create, edit, and delete policies" },
      { key: PERMISSIONS.POLICIES_APPROVE, label: "Approve policies", description: "Approve policies for enforcement (separation of duties)" },
    ],
  },
  {
    label: "Evidence",
    permissions: [
      { key: PERMISSIONS.EVIDENCE_READ, label: "View evidence", description: "See uploaded evidence artifacts" },
      { key: PERMISSIONS.EVIDENCE_UPLOAD, label: "Upload evidence", description: "Upload new evidence artifacts" },
      { key: PERMISSIONS.EVIDENCE_DELETE, label: "Delete evidence", description: "Remove evidence artifacts" },
      { key: PERMISSIONS.EVIDENCE_REVIEW, label: "Review evidence", description: "Approve or reject evidence for compliance" },
    ],
  },
  {
    label: "Findings",
    permissions: [
      { key: PERMISSIONS.FINDINGS_READ, label: "View findings", description: "See findings and issues" },
      { key: PERMISSIONS.FINDINGS_WRITE, label: "Manage findings", description: "Create and update findings" },
      { key: PERMISSIONS.FINDINGS_CLOSE, label: "Close findings", description: "Mark findings as resolved or accepted" },
    ],
  },
  {
    label: "Exceptions",
    permissions: [
      { key: PERMISSIONS.EXCEPTIONS_READ, label: "View exceptions", description: "See control exception requests" },
      { key: PERMISSIONS.EXCEPTIONS_REQUEST, label: "Request exceptions", description: "Submit control exception requests" },
      { key: PERMISSIONS.EXCEPTIONS_APPROVE, label: "Approve exceptions", description: "Approve or reject exception requests" },
    ],
  },
  {
    label: "Vendors",
    permissions: [
      { key: PERMISSIONS.VENDORS_READ, label: "View vendors", description: "See vendor list and risk assessments" },
      { key: PERMISSIONS.VENDORS_WRITE, label: "Manage vendors", description: "Create, edit, and assess vendors" },
    ],
  },
  {
    label: "Reports",
    permissions: [
      { key: PERMISSIONS.REPORTS_EXPORT, label: "Export reports", description: "Generate and export auditor-ready PDF reports" },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: PERMISSIONS.USERS_READ, label: "View team", description: "See the team member list" },
      { key: PERMISSIONS.USERS_MANAGE, label: "Manage users", description: "Add, edit, and remove team members" },
      { key: PERMISSIONS.ORG_MANAGE, label: "Manage organization", description: "Edit organization name and settings" },
      { key: PERMISSIONS.ROLES_MANAGE, label: "Manage roles", description: "Create, edit, and delete custom roles" },
      { key: PERMISSIONS.FRAMEWORKS_MANAGE, label: "Manage frameworks", description: "Add and configure compliance frameworks" },
      { key: PERMISSIONS.AUDIT_READ, label: "View audit log", description: "See the full activity audit trail" },
    ],
  },
  {
    label: "Trust Vault",
    permissions: [
      { key: PERMISSIONS.TRUST_VAULT_READ, label: "View Trust Vault", description: "See trust vault settings and access requests" },
      { key: PERMISSIONS.TRUST_VAULT_MANAGE, label: "Manage Trust Vault", description: "Configure trust vault content, approve access requests" },
    ],
  },
  {
    label: "Tasks",
    permissions: [
      { key: PERMISSIONS.TASKS_READ, label: "View all tasks", description: "See every task in the organisation, not just your own" },
      { key: PERMISSIONS.TASKS_MANAGE, label: "Manage tasks", description: "Create, assign, edit, and delete tasks" },
    ],
  },
];

// Human-readable name for a permission key, for error messages.
export function permissionLabel(key: string): string {
  for (const group of PERMISSION_CATEGORIES) {
    const hit = group.permissions.find((p) => p.key === key);
    if (hit) return hit.label;
  }
  return key;
}

// ─── Built-in Role Templates ─────────────────────────────────

export type BuiltInRoleTemplate = {
  name: string;
  description: string;
  permissions: Permission[];
};

export const BUILT_IN_ROLES: BuiltInRoleTemplate[] = [
  {
    name: "Admin",
    description: "Full access to everything including user and role management",
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "Compliance Manager",
    description: "Manage controls, policies, evidence, risks, and frameworks — no user management",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.CONTROLS_WRITE,
      PERMISSIONS.RISKS_READ,
      PERMISSIONS.RISKS_WRITE,
      PERMISSIONS.POLICIES_READ,
      PERMISSIONS.POLICIES_WRITE,
      PERMISSIONS.POLICIES_APPROVE,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.EVIDENCE_UPLOAD,
      PERMISSIONS.EVIDENCE_DELETE,
      PERMISSIONS.EVIDENCE_REVIEW,
      PERMISSIONS.FINDINGS_READ,
      PERMISSIONS.FINDINGS_WRITE,
      PERMISSIONS.FINDINGS_CLOSE,
      PERMISSIONS.EXCEPTIONS_READ,
      PERMISSIONS.EXCEPTIONS_REQUEST,
      PERMISSIONS.EXCEPTIONS_APPROVE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_WRITE,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.FRAMEWORKS_MANAGE,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_MANAGE,
    ],
  },
  {
    name: "Editor",
    description: "Create and edit compliance data — cannot approve policies or manage users",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.CONTROLS_WRITE,
      PERMISSIONS.RISKS_READ,
      PERMISSIONS.RISKS_WRITE,
      PERMISSIONS.POLICIES_READ,
      PERMISSIONS.POLICIES_WRITE,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.EVIDENCE_UPLOAD,
      PERMISSIONS.EVIDENCE_DELETE,
      PERMISSIONS.FINDINGS_READ,
      PERMISSIONS.FINDINGS_WRITE,
      PERMISSIONS.EXCEPTIONS_READ,
      PERMISSIONS.EXCEPTIONS_REQUEST,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_WRITE,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_MANAGE,
    ],
  },
  {
    name: "Auditor",
    description: "Read-only access to everything plus report export — ideal for external auditors",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.RISKS_READ,
      PERMISSIONS.POLICIES_READ,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.FINDINGS_READ,
      PERMISSIONS.EXCEPTIONS_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.TASKS_READ,
    ],
  },
  {
    name: "Risk Analyst",
    description: "Manage risks and view controls — focused on risk assessment workflows",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.RISKS_READ,
      PERMISSIONS.RISKS_WRITE,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.FINDINGS_READ,
      PERMISSIONS.FINDINGS_WRITE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_WRITE,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_MANAGE,
    ],
  },
  {
    name: "Policy Admin",
    description: "Create, edit, and approve policies — focused on governance workflows",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.POLICIES_READ,
      PERMISSIONS.POLICIES_WRITE,
      PERMISSIONS.POLICIES_APPROVE,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.EXCEPTIONS_READ,
      PERMISSIONS.EXCEPTIONS_APPROVE,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_MANAGE,
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access to compliance data — cannot make any changes",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTROLS_READ,
      PERMISSIONS.RISKS_READ,
      PERMISSIONS.POLICIES_READ,
      PERMISSIONS.EVIDENCE_READ,
      PERMISSIONS.FINDINGS_READ,
      PERMISSIONS.EXCEPTIONS_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.TASKS_READ,
    ],
  },
];

// ─── Legacy Role → Permission Mapping ────────────────────────
// Used when a user has no custom Role assigned (roleId is null).

const LEGACY_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  EDITOR: BUILT_IN_ROLES.find((r) => r.name === "Editor")!.permissions,
  VIEWER: BUILT_IN_ROLES.find((r) => r.name === "Viewer")!.permissions,
};

// ─── Permission Resolution ──────────────────────────────────

export type ResolvedPermissions = {
  roleName: string;
  permissions: Set<Permission>;
  isCustomRole: boolean;
  frameworkScopeIds: string[] | null; // null = all frameworks
};

export function resolvePermissions(user: {
  role: UserRole;
  customRole?: { name: string; permissions: unknown } | null;
  frameworkScopes?: { frameworkId: string }[] | null;
}): ResolvedPermissions {
  let permissions: Permission[];
  let roleName: string;
  let isCustomRole: boolean;

  if (user.customRole) {
    const raw = user.customRole.permissions;
    permissions = Array.isArray(raw) ? (raw as Permission[]) : [];
    roleName = user.customRole.name;
    isCustomRole = !false; // could be built-in, but it's from the Role model
  } else {
    permissions = LEGACY_ROLE_PERMISSIONS[user.role] ?? [];
    roleName = user.role;
    isCustomRole = false;
  }

  const frameworkScopes = user.frameworkScopes;
  const frameworkScopeIds =
    frameworkScopes && frameworkScopes.length > 0
      ? frameworkScopes.map((s) => s.frameworkId)
      : null;

  return {
    roleName,
    permissions: new Set(permissions),
    isCustomRole: !!user.customRole,
    frameworkScopeIds,
  };
}

export function hasPermission(
  resolved: ResolvedPermissions,
  permission: Permission
): boolean {
  return resolved.permissions.has(permission);
}

export function hasAnyPermission(
  resolved: ResolvedPermissions,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => resolved.permissions.has(p));
}

export function hasAllPermissions(
  resolved: ResolvedPermissions,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => resolved.permissions.has(p));
}

// ─── Legacy Compat (keep old callers working during migration) ────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
};

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function canEdit(userRole: UserRole): boolean {
  return hasRole(userRole, "EDITOR");
}

export function canAdmin(userRole: UserRole): boolean {
  return hasRole(userRole, "ADMIN");
}
