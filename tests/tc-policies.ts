/**
 * Policy Lifecycle & Governance test cases TC-189 through TC-220
 * Run: npx tsx tests/tc-policies.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";
const PASSWORD = "TestPass123!";

let orgA: { id: string };
let orgB: { id: string };
let adminA: { id: string; email: string };
let editorA: { id: string; email: string };
let viewerA: { id: string; email: string };
let adminB: { id: string; email: string };
let cookieAdminA = "";
let cookieEditorA = "";
let cookieViewerA = "";
let cookieAdminB = "";

let ctrl001Id = "";
let ctrl002Id = "";
let ctrl003Id = "";
let ctrlBId = "";

let policyId = "";
let policy2Id = "";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

async function login(email: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = csrfCookies.map((c: string) => c.split(";")[0]).join("; ");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader },
    body: new URLSearchParams({ email, password: PASSWORD, csrfToken: csrfData.csrfToken, callbackUrl: BASE, json: "true" }),
    redirect: "manual",
  });
  const sessionCookie = (res.headers.getSetCookie?.() ?? [])
    .filter((c: string) => c.includes("next-auth.session-token"))
    .map((c: string) => c.split(";")[0]).join("; ");
  return [cookieHeader, sessionCookie].filter(Boolean).join("; ");
}

async function api(path: string, opts: RequestInit & { cookie?: string } = {}) {
  const { cookie, ...init } = opts;
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> || {}) };
  if (cookie) headers.cookie = cookie;
  if (init.body && typeof init.body === "string") headers["content-type"] = "application/json";
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function setup() {
  console.log("\n--- Setup ---");
  const pw = await hash(PASSWORD, 10);
  const { BUILT_IN_ROLES } = await import("../src/lib/permissions");

  await prisma.user.deleteMany({ where: { email: { in: ["tc-pol-admin@a.com", "tc-pol-editor@a.com", "tc-pol-viewer@a.com", "tc-pol-admin@b.com"] } } });
  await prisma.organization.deleteMany({ where: { slug: { in: ["tc-pol-a", "tc-pol-b"] } } });

  orgA = await prisma.organization.create({ data: { name: "PolA", slug: "tc-pol-a", onboardingComplete: true } });
  orgB = await prisma.organization.create({ data: { name: "PolB", slug: "tc-pol-b", onboardingComplete: true } });

  const adminPerms = BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions;
  const editorPerms = BUILT_IN_ROLES.find(r => r.name === "Compliance Manager")!.permissions;
  const viewerPerms = BUILT_IN_ROLES.find(r => r.name === "Viewer")!.permissions;

  const adminRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Admin", description: "Full", permissions: adminPerms, isBuiltIn: true } });
  const editorRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Editor", description: "Edit", permissions: editorPerms, isBuiltIn: true } });
  const viewerRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Viewer", description: "Read-only", permissions: viewerPerms, isBuiltIn: true } });
  const adminRoleB = await prisma.role.create({ data: { organizationId: orgB.id, name: "Admin", description: "Full", permissions: adminPerms, isBuiltIn: true } });

  adminA = await prisma.user.create({ data: { email: "tc-pol-admin@a.com", name: "PolAdmin A", passwordHash: pw, role: "ADMIN", roleId: adminRoleA.id, organizationId: orgA.id } });
  editorA = await prisma.user.create({ data: { email: "tc-pol-editor@a.com", name: "PolEditor A", passwordHash: pw, role: "EDITOR", roleId: editorRoleA.id, organizationId: orgA.id } });
  viewerA = await prisma.user.create({ data: { email: "tc-pol-viewer@a.com", name: "PolViewer A", passwordHash: pw, role: "VIEWER", roleId: viewerRoleA.id, organizationId: orgA.id } });
  adminB = await prisma.user.create({ data: { email: "tc-pol-admin@b.com", name: "PolAdmin B", passwordHash: pw, role: "ADMIN", roleId: adminRoleB.id, organizationId: orgB.id } });

  const c1 = await prisma.control.create({ data: { organizationId: orgA.id, code: "PCTRL-001", title: "Quarterly Production Access Review", status: "IMPLEMENTED", frequency: "QUARTERLY" } });
  const c2 = await prisma.control.create({ data: { organizationId: orgA.id, code: "PCTRL-002", title: "Backup Monitoring", status: "IMPLEMENTED", frequency: "MONTHLY" } });
  const c3 = await prisma.control.create({ data: { organizationId: orgA.id, code: "PCTRL-003", title: "Change Management", status: "IMPLEMENTED", frequency: "QUARTERLY" } });
  const cB = await prisma.control.create({ data: { organizationId: orgB.id, code: "PCTRL-B01", title: "OrgB Control", status: "IMPLEMENTED", frequency: "MONTHLY" } });
  ctrl001Id = c1.id; ctrl002Id = c2.id; ctrl003Id = c3.id; ctrlBId = cB.id;

  cookieAdminA = await login("tc-pol-admin@a.com");
  cookieEditorA = await login("tc-pol-editor@a.com");
  cookieViewerA = await login("tc-pol-viewer@a.com");
  cookieAdminB = await login("tc-pol-admin@b.com");
  console.log("  Setup complete");
}

// TC-189: Create Draft Policy (CRITICAL)
async function tc189() {
  console.log("\nTC-189: Create draft policy");
  const res = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({
      title: "Information Security Policy",
      version: "1.0",
      content: "Test security policy content",
      ownerId: editorA.id,
      effectiveDate: new Date(Date.now() + 30 * 86400000).toISOString(), // always in the future
      reviewDate: "2027-09-30T00:00:00.000Z",
    }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.status === "DRAFT", "status is DRAFT");
  assert(body.title === "Information Security Policy", "title correct");
  assert(body.version === "1.0", "version is 1.0");
  assert(body.ownerId === editorA.id, "owner set");
  assert(body.organizationId === orgA.id, "scoped to org");
  policyId = body.id;

  // Verify in list
  const list = await (await api("/api/policies", { cookie: cookieEditorA })).json();
  assert(list.some((p: any) => p.id === policyId), "appears in list");

  // Verify audit
  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.some((l: any) => l.action === "CREATE"), "audit record generated");
}

// TC-190: Mandatory field validation
async function tc190() {
  console.log("\nTC-190: Mandatory field validation");
  const r1 = await api("/api/policies", { method: "POST", cookie: cookieEditorA, body: JSON.stringify({ content: "x", ownerId: editorA.id }) });
  assert(r1.status === 400, "no title rejected");
  const r2 = await api("/api/policies", { method: "POST", cookie: cookieEditorA, body: JSON.stringify({ title: "X", ownerId: editorA.id }) });
  assert(r2.status === 400, "no content rejected (empty default removed)");
  const r3 = await api("/api/policies", { method: "POST", cookie: cookieEditorA, body: JSON.stringify({ title: "X", content: "Y" }) });
  assert(r3.status === 400, "no owner rejected");
  const r4 = await api("/api/policies", { method: "POST", cookie: cookieEditorA, body: JSON.stringify({ title: "X", content: "Y", ownerId: editorA.id, status: "BANANA" }) });
  assert(r4.status === 400, "invalid status rejected");
  const r5 = await api("/api/policies", { method: "POST", cookie: cookieEditorA, body: JSON.stringify({ title: "X", content: "Y", ownerId: editorA.id, effectiveDate: "not-a-date" }) });
  assert(r5.status === 400, "invalid date rejected");
}

// TC-191: Edit Draft Policy
async function tc191() {
  console.log("\nTC-191: Edit draft policy");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ content: "Employees must use MFA for corporate systems." }),
  });
  const body = await res.json();
  assert(res.status === 200, "200 updated");
  assert(body.content === "Employees must use MFA for corporate systems.", "content updated");
  assert(body.version === "1.0", "version unchanged");
  assert(body.status === "DRAFT", "still DRAFT");

  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  const updates = logs.filter((l: any) => l.action === "UPDATE");
  assert(updates.length >= 1, "audit captures edit");
}

// TC-192: Submit for review (CRITICAL)
async function tc192() {
  console.log("\nTC-192: Submit policy for review");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ status: "IN_REVIEW" }),
  });
  const body = await res.json();
  assert(res.status === 200, "200 updated");
  assert(body.status === "IN_REVIEW", "status is IN_REVIEW");

  // Viewer can see it
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieViewerA })).json();
  assert(detail.status === "IN_REVIEW", "viewer can see IN_REVIEW policy");

  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.some((l: any) => l.action === "UPDATE"), "audit event created");
}

// TC-193: Approve policy (CRITICAL)
async function tc193() {
  console.log("\nTC-193: Approve policy");
  // AdminA approves (editorA was last editor, so AdminA can approve)
  const res = await api(`/api/policies/${policyId}/approve`, {
    method: "POST", cookie: cookieAdminA,
  });
  const body = await res.json();
  assert(res.status === 200, "200 approved");
  assert(body.status === "APPROVED", "status is APPROVED");
  assert(body.approverId === adminA.id, "approvedBy is adminA");
  assert(body.approvedAt !== null, "approvedAt set");
  assert(body.version === "1.0", "version preserved");

  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.some((l: any) => l.changes?.approvedBy), "audit records approval");
}

// TC-194: Creator cannot approve own policy (CRITICAL)
async function tc194() {
  console.log("\nTC-194: Self-approval prevented (separation of duties)");
  // Create a new policy as adminA
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "SoD Test Policy", content: "Self-approval test", ownerId: adminA.id }),
  });
  const pol = await cr.json();
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieAdminA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  // AdminA tries to approve their own policy
  const res = await api(`/api/policies/${pol.id}/approve`, { method: "POST", cookie: cookieAdminA });
  assert(res.status === 403, "self-approval rejected (403)");
  const body = await res.json();
  assert(body.error?.includes("Separation of duties") || body.message?.includes("Separation of duties"), "error message mentions separation of duties");
  // Cleanup
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-195: Viewer cannot approve
async function tc195() {
  console.log("\nTC-195: Viewer cannot approve");
  const res = await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieViewerA });
  assert(res.status === 403, "viewer gets 403 on approve");
}

// TC-196: Edit approved policy (CRITICAL)
async function tc196() {
  console.log("\nTC-196: Edit approved policy creates new version");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ content: "Updated MFA policy with additional requirements." }),
  });
  const body = await res.json();
  assert(res.status === 200, "200 updated");
  assert(body.status === "DRAFT", "status reverted to DRAFT");
  assert(body.version === "1.1", "version bumped to 1.1");
  assert(body.approverId === null, "approval cleared");
  assert(body.approvedAt === null, "approvedAt cleared");
}

// TC-197: Create new policy version (CRITICAL)
async function tc197() {
  console.log("\nTC-197: Create new policy version");
  // First approve v1.1
  await api(`/api/policies/${policyId}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieAdminA });

  // Now edit again to create v2.0
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ content: "Version 2 content — completely revised.", version: "2.0" }),
  });
  const body = await res.json();
  assert(res.status === 200, "200 updated");
  assert(body.version === "2.0", "version is 2.0");
  assert(body.status === "DRAFT", "new version starts as DRAFT");
}

// TC-198: Version history (CRITICAL)
async function tc198() {
  console.log("\nTC-198: Version history");
  const res = await api(`/api/policies/${policyId}/versions`, { cookie: cookieEditorA });
  const versions = await res.json();
  assert(res.status === 200, "200 ok");
  assert(versions.length >= 3, `${versions.length} versions in history (current + historical)`);
  // Current should be 2.0, historical should have 1.1 and 1.0
  const current = versions.find((v: any) => v.isCurrent);
  assert(current?.version === "2.0", "current version is 2.0");
  const historical = versions.filter((v: any) => !v.isCurrent);
  assert(historical.some((v: any) => v.version === "1.0"), "v1.0 in history");
  assert(historical.some((v: any) => v.version === "1.1"), "v1.1 in history");
  // Historical content preserved
  const v10 = historical.find((v: any) => v.version === "1.0");
  assert(v10?.content !== undefined && v10.content.length > 0, "v1.0 content preserved");
}

// TC-199: Map policy to one control
async function tc199() {
  console.log("\nTC-199: Map policy to one control");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrl001Id] }),
  });
  assert(res.status === 200, "PATCH succeeds");
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  assert(detail.controls.length === 1, "1 control mapped");
  assert(detail.controls[0].control.code === "PCTRL-001", "PCTRL-001 mapped");
}

// TC-200: Map policy to multiple controls (CRITICAL)
async function tc200() {
  console.log("\nTC-200: Map policy to multiple controls");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id, ctrl003Id] }),
  });
  assert(res.status === 200, "PATCH succeeds");
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  assert(detail.controls.length === 3, "3 controls mapped");
}

// TC-201: One control → multiple policies (CRITICAL)
async function tc201() {
  console.log("\nTC-201: One control linked to multiple policies");
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Access Control Policy", content: "Access control content", ownerId: editorA.id, controlIds: [ctrl001Id] }),
  });
  const pol2 = await cr.json();
  policy2Id = pol2.id;
  assert(cr.status === 201, "second policy created with ctrl001");

  // Both policies now have ctrl001
  const d1 = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  const d2 = await (await api(`/api/policies/${policy2Id}`, { cookie: cookieEditorA })).json();
  assert(d1.controls.some((c: any) => c.control.id === ctrl001Id), "policy1 has ctrl001");
  assert(d2.controls.some((c: any) => c.control.id === ctrl001Id), "policy2 has ctrl001");
}

// TC-202: Duplicate policy-control mapping
async function tc202() {
  console.log("\nTC-202: Duplicate policy-control mapping prevented");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id, ctrl003Id] }),
  });
  assert(res.status === 200, "idempotent PATCH succeeds");
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  assert(detail.controls.length === 3, "still exactly 3 (no duplicates)");
}

// TC-203: Remove policy-control mapping
async function tc203() {
  console.log("\nTC-203: Remove policy-control mapping");
  const res = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrl002Id, ctrl003Id] }),
  });
  assert(res.status === 200, "PATCH removes ctrl001");
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  assert(detail.controls.length === 2, "2 controls remain");
  assert(!detail.controls.some((c: any) => c.control.id === ctrl001Id), "ctrl001 removed");
  const ctrl = await prisma.control.findUnique({ where: { id: ctrl001Id } });
  assert(ctrl !== null, "control still exists");

  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.some((l: any) => l.changes?.controlCount), "audit event for mapping change");
}

// TC-204: Effective date
async function tc204() {
  console.log("\nTC-204: Effective date");
  const detail = await (await api(`/api/policies/${policyId}`, { cookie: cookieEditorA })).json();
  const effDate = new Date(detail.effectiveDate);
  assert(effDate > new Date(), "effective date is in the future");
  assert(detail.status !== "APPROVED", "not currently approved (so not effective)");
}

// TC-205: Expired policy (CRITICAL)
async function tc205() {
  console.log("\nTC-205: Expired policy");
  // Create a policy with past expiry
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({
      title: "Expired Test Policy", content: "Old content", ownerId: editorA.id,
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    }),
  });
  const pol = await cr.json();
  // Submit and approve
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  await api(`/api/policies/${pol.id}/approve`, { method: "POST", cookie: cookieAdminA });
  // Now set to expired
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "EXPIRED" }) });
  const detail = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(detail.status === "EXPIRED", "policy status is EXPIRED");
  // Cleanup
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-206: Policy expiring soon
async function tc206() {
  console.log("\nTC-206: Policy expiring soon");
  const soonDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Expiring Soon Policy", content: "Soon", ownerId: editorA.id, reviewDate: soonDate }),
  });
  const pol = await cr.json();
  const list = await (await api("/api/policies", { cookie: cookieEditorA })).json();
  const found = list.find((p: any) => p.id === pol.id);
  assert(found?.dueSoonOrOverdue === "DUE_SOON", "shows DUE_SOON indicator");
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-207: Expired policy affects control/compliance
async function tc207() {
  console.log("\nTC-207: Expired policy affects compliance");
  // Create expired policy linked to ctrl002
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({
      title: "Expired Compliance Policy", content: "Expired", ownerId: editorA.id,
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
      controlIds: [ctrl002Id],
    }),
  });
  const pol = await cr.json();
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "EXPIRED" }) });

  const list = await (await api("/api/policies", { cookie: cookieEditorA })).json();
  const found = list.find((p: any) => p.id === pol.id);
  assert(found?.status === "EXPIRED", "expired policy visible in list");
  assert(found?.controls?.some((c: any) => c.control.id === ctrl002Id), "expired policy still linked to control");
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-208: Policy review
async function tc208() {
  console.log("\nTC-208: Policy review");
  // Approve the main policy first so we can review it
  await api(`/api/policies/${policyId}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieAdminA });

  const res = await api(`/api/policies/${policyId}/review`, { method: "POST", cookie: cookieAdminA });
  const body = await res.json();
  assert(res.status === 200, "200 reviewed");
  assert(body.reviewedById === adminA.id, "reviewer recorded");
  assert(body.reviewedAt !== null, "review date recorded");

  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.some((l: any) => l.changes?.reviewedBy), "audit event for review");
}

// TC-209: Review overdue (CRITICAL)
async function tc209() {
  console.log("\nTC-209: Review overdue");
  const pastDate = new Date(Date.now() - 5 * 86400000).toISOString();
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Overdue Review Policy", content: "Overdue", ownerId: editorA.id, reviewDate: pastDate }),
  });
  const pol = await cr.json();
  const list = await (await api("/api/policies", { cookie: cookieEditorA })).json();
  const found = list.find((p: any) => p.id === pol.id);
  assert(found?.dueSoonOrOverdue === "OVERDUE", "shows OVERDUE indicator");
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-210: Viewer access
async function tc210() {
  console.log("\nTC-210: Viewer access");
  const r1 = await api("/api/policies", { cookie: cookieViewerA });
  assert(r1.status === 200, "viewer can list policies");
  const r2 = await api(`/api/policies/${policyId}`, { cookie: cookieViewerA });
  assert(r2.status === 200, "viewer can view policy");
  const r3 = await api(`/api/policies/${policyId}`, { method: "PATCH", cookie: cookieViewerA, body: JSON.stringify({ title: "Hacked" }) });
  assert(r3.status === 403, "viewer cannot edit");
  const r4 = await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieViewerA });
  assert(r4.status === 403, "viewer cannot approve");
  const r5 = await api(`/api/policies/${policyId}`, { method: "DELETE", cookie: cookieViewerA });
  assert(r5.status === 403, "viewer cannot delete");
}

// TC-211: Direct API authorization (CRITICAL)
async function tc211() {
  console.log("\nTC-211: Direct API authorization");
  const r1 = await api(`/api/policies/${policyId}`, { method: "PATCH", cookie: cookieViewerA, body: JSON.stringify({ status: "DRAFT" }) });
  assert(r1.status === 403, "PATCH returns 403 for viewer");
  const r2 = await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieViewerA });
  assert(r2.status === 403, "approve returns 403 for viewer");
  const r3 = await api(`/api/policies/${policyId}`, { method: "DELETE", cookie: cookieViewerA });
  assert(r3.status === 403, "DELETE returns 403 for viewer");
}

// TC-212: Cross-tenant policy access (CRITICAL)
async function tc212() {
  console.log("\nTC-212: Cross-tenant policy access");
  const r1 = await api(`/api/policies/${policyId}`, { cookie: cookieAdminB });
  assert(r1.status === 404, "orgB cannot view orgA policy");
  const r2 = await api(`/api/policies/${policyId}`, { method: "PATCH", cookie: cookieAdminB, body: JSON.stringify({ title: "Stolen" }) });
  assert(r2.status === 404, "orgB cannot edit orgA policy");
  const r3 = await api(`/api/policies/${policyId}/approve`, { method: "POST", cookie: cookieAdminB });
  assert(r3.status === 404, "orgB cannot approve orgA policy");
  const r4 = await api(`/api/policies/${policyId}`, { method: "DELETE", cookie: cookieAdminB });
  assert(r4.status === 404, "orgB cannot delete orgA policy");
}

// TC-213: Cross-tenant policy-control mapping (CRITICAL)
async function tc213() {
  console.log("\nTC-213: Cross-tenant policy-control mapping");
  const r1 = await api(`/api/policies/${policyId}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrlBId] }),
  });
  assert(r1.status === 400, "cannot map orgA policy to orgB control");

  // Create orgB policy and try to map to orgA control
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieAdminB,
    body: JSON.stringify({ title: "OrgB Policy", content: "Content", ownerId: adminB.id }),
  });
  const polB = await cr.json();
  const r2 = await api(`/api/policies/${polB.id}`, {
    method: "PATCH", cookie: cookieAdminB,
    body: JSON.stringify({ controlIds: [ctrl001Id] }),
  });
  assert(r2.status === 400, "cannot map orgB policy to orgA control");
  await prisma.policy.delete({ where: { id: polB.id } });
}

// TC-214: Tamper with approvedBy
async function tc214() {
  console.log("\nTC-214: Tamper with approvedBy");
  // The approve endpoint derives approver from session — no body param for approvedBy
  // Create and submit a policy by editorA
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Tamper Test", content: "Content", ownerId: editorA.id }),
  });
  const pol = await cr.json();
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  // AdminA approves — the server should use session user, not any submitted body
  const res = await api(`/api/policies/${pol.id}/approve`, { method: "POST", cookie: cookieAdminA });
  const body = await res.json();
  assert(body.approverId === adminA.id, "approver derived from session, not body");
  await prisma.policy.delete({ where: { id: pol.id } });
}

// TC-215: Tamper with organizationId
async function tc215() {
  console.log("\nTC-215: Tamper with organizationId");
  // POST policy with organizationId of orgB while logged in as orgA
  const res = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Tamper Org", content: "Content", ownerId: editorA.id, organizationId: orgB.id }),
  });
  const body = await res.json();
  // Should succeed but use orgA's orgId from session, not submitted one
  if (res.status === 201) {
    assert(body.organizationId === orgA.id, "organizationId derived from session");
    await prisma.policy.delete({ where: { id: body.id } });
  } else {
    assert(res.status === 400, "rejected tampered organizationId");
  }
}

// TC-216: Delete draft
async function tc216() {
  console.log("\nTC-216: Delete draft policy");
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({ title: "Draft to Delete", content: "Delete me", ownerId: editorA.id }),
  });
  const pol = await cr.json();
  const res = await api(`/api/policies/${pol.id}`, { method: "DELETE", cookie: cookieEditorA });
  assert(res.status === 200, "draft deleted successfully");
  const check = await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA });
  assert(check.status === 404, "deleted policy no longer accessible");
}

// TC-217: Delete approved policy
async function tc217() {
  console.log("\nTC-217: Delete approved policy (blocked)");
  // policyId is currently APPROVED
  const res = await api(`/api/policies/${policyId}`, { method: "DELETE", cookie: cookieEditorA });
  assert(res.status === 400, "approved policy cannot be deleted");
  const body = await res.json();
  assert(body.error?.includes("archive") || body.message?.includes("archive"), "error suggests archiving");
}

// TC-218: Complete policy audit trail (CRITICAL)
async function tc218() {
  console.log("\nTC-218: Complete policy audit trail");
  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  const actions = logs.map((l: any) => l.action);
  assert(actions.includes("CREATE"), "CREATE in audit trail");
  assert(actions.filter((a: string) => a === "UPDATE").length >= 4, "multiple UPDATEs in trail");
  assert(logs.length >= 5, `${logs.length} total audit entries (comprehensive trail)`);
}

// TC-219: Audit immutability
async function tc219() {
  console.log("\nTC-219: Audit immutability");
  // There's no DELETE endpoint for audit logs, and no PATCH
  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${policyId}`, { cookie: cookieAdminA })).json();
  assert(logs.length > 0, "audit logs exist");
  // Try to delete via API — no such endpoint
  const r1 = await api(`/api/audit-logs/${logs[0].id}`, { method: "DELETE", cookie: cookieAdminA });
  assert(r1.status === 404 || r1.status === 405, "cannot delete audit logs via API");
  const r2 = await api(`/api/audit-logs/${logs[0].id}`, { method: "PATCH", cookie: cookieAdminA, body: JSON.stringify({ action: "FAKE" }) });
  assert(r2.status === 404 || r2.status === 405, "cannot modify audit logs via API");
}

// TC-220: Complete governance lifecycle (CRITICAL integration test)
async function tc220() {
  console.log("\nTC-220: Complete governance lifecycle");

  // 1. Create policy
  const cr = await api("/api/policies", {
    method: "POST", cookie: cookieEditorA,
    body: JSON.stringify({
      title: "E2E: Data Protection Policy", content: "Comprehensive data protection policy.",
      ownerId: editorA.id,
      effectiveDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      reviewDate: new Date(Date.now() + 365 * 86400000).toISOString(),
    }),
  });
  const pol = await cr.json();
  assert(cr.status === 201, "1. policy created");
  assert(pol.status === "DRAFT", "2. starts as DRAFT");

  // 3. DRAFT → IN_REVIEW
  await api(`/api/policies/${pol.id}`, { method: "PATCH", cookie: cookieEditorA, body: JSON.stringify({ status: "IN_REVIEW" }) });
  const inReview = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(inReview.status === "IN_REVIEW", "3. status is IN_REVIEW");

  // 4. IN_REVIEW → APPROVED
  await api(`/api/policies/${pol.id}/approve`, { method: "POST", cookie: cookieAdminA });
  const approved = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(approved.status === "APPROVED", "4. status is APPROVED");

  // 5. Map to controls
  await api(`/api/policies/${pol.id}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id] }),
  });
  const withControls = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(withControls.controls.length === 2, "5. mapped to 2 controls");

  // 6. Policy becomes evidence of governance (it's approved and mapped)
  assert(withControls.status === "APPROVED" && withControls.controls.length > 0, "6. approved policy with controls = governance evidence");

  // 7. Policy review
  await api(`/api/policies/${pol.id}/review`, { method: "POST", cookie: cookieAdminA });
  const reviewed = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(reviewed.reviewedAt !== null, "7. review date recorded");

  // 8. New version
  await api(`/api/policies/${pol.id}`, {
    method: "PATCH", cookie: cookieEditorA,
    body: JSON.stringify({ content: "Revised data protection policy v2.", version: "2.0" }),
  });
  const newVer = await (await api(`/api/policies/${pol.id}`, { cookie: cookieEditorA })).json();
  assert(newVer.version === "2.0", "8. new version 2.0");
  assert(newVer.status === "DRAFT", "8. new version starts DRAFT");

  // 9. Check version history
  const versions = await (await api(`/api/policies/${pol.id}/versions`, { cookie: cookieEditorA })).json();
  assert(versions.length >= 2, "9. version history has multiple entries");

  // 10. Verify complete audit trail
  const logs = await (await api(`/api/audit-logs?entityType=Policy&entityId=${pol.id}`, { cookie: cookieAdminA })).json();
  assert(logs.length >= 5, `10. ${logs.length} audit entries — complete trail`);

  // Cleanup
  await prisma.policyVersion.deleteMany({ where: { policyId: pol.id } });
  await prisma.policy.delete({ where: { id: pol.id } });
}

async function cleanup() {
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean);
  if (orgIds.length === 0) return;
  await prisma.policyVersion.deleteMany({ where: { policy: { organizationId: { in: orgIds } } } });
  await prisma.policyControl.deleteMany({ where: { policy: { organizationId: { in: orgIds } } } });
  await prisma.policy.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function run() {
  try {
    await setup();
    await tc189(); await tc190(); await tc191(); await tc192();
    await tc193(); await tc194(); await tc195(); await tc196();
    await tc197(); await tc198(); await tc199(); await tc200();
    await tc201(); await tc202(); await tc203(); await tc204();
    await tc205(); await tc206(); await tc207(); await tc208();
    await tc209(); await tc210(); await tc211(); await tc212();
    await tc213(); await tc214(); await tc215(); await tc216();
    await tc217(); await tc218(); await tc219(); await tc220();
  } catch (err) {
    console.error("FATAL:", err);
    failed++;
  } finally {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
