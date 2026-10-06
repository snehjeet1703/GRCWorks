/**
 * Findings & Remediation Lifecycle test cases TC-121 through TC-153
 * Run: npx tsx tests/tc-findings.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";
const PASSWORD = "TestPass123!";

let orgA: { id: string };
let orgB: { id: string };
let adminA: { id: string; email: string };
let viewerA: { id: string; email: string };
let adminB: { id: string; email: string };
let cookieAdminA = "";
let cookieViewerA = "";
let cookieAdminB = "";

let controlAId = "";
let controlBId = "";
let riskAId = "";

let findingManualId = "";
let findingAuditId = "";
let findingNoControlId = "";
let findingWithControlId = "";
let findingWithRiskId = "";
let findingLifecycleId = "";
let findingOverdueId = "";
let findingDueSoonId = "";
let findingClosedId = "";
let findingDeleteId = "";
let findingE2EId = "";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function login(email: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = csrfCookies.map((c: string) => c.split(";")[0]).join("; ");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: cookieHeader },
    body: new URLSearchParams({
      email, password: PASSWORD, csrfToken: csrfData.csrfToken, callbackUrl: BASE, json: "true",
    }),
    redirect: "manual",
  });
  const sessionCookie = (res.headers.getSetCookie?.() ?? [])
    .filter((c: string) => c.includes("next-auth.session-token"))
    .map((c: string) => c.split(";")[0])
    .join("; ");
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

  // Cleanup — delete orgs cascades everything
  await prisma.user.deleteMany({ where: { email: { in: ["tc-find-admin@a.com", "tc-find-viewer@a.com", "tc-find-admin@b.com", "tc-find-writer@a.com"] } } });
  await prisma.organization.deleteMany({ where: { slug: { in: ["tc-findings-a", "tc-findings-b"] } } });

  orgA = await prisma.organization.create({ data: { name: "FindingsA", slug: "tc-findings-a", onboardingComplete: true } });
  orgB = await prisma.organization.create({ data: { name: "FindingsB", slug: "tc-findings-b", onboardingComplete: true } });

  const adminRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true } });
  const viewerRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Viewer", description: "Read-only", permissions: BUILT_IN_ROLES.find(r => r.name === "Viewer")!.permissions, isBuiltIn: true } });
  const adminRoleB = await prisma.role.create({ data: { organizationId: orgB.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true } });

  adminA = await prisma.user.create({ data: { email: "tc-find-admin@a.com", name: "FindAdmin A", passwordHash: pw, role: "ADMIN", roleId: adminRoleA.id, organizationId: orgA.id } });
  viewerA = await prisma.user.create({ data: { email: "tc-find-viewer@a.com", name: "FindViewer A", passwordHash: pw, role: "VIEWER", roleId: viewerRoleA.id, organizationId: orgA.id } });
  adminB = await prisma.user.create({ data: { email: "tc-find-admin@b.com", name: "FindAdmin B", passwordHash: pw, role: "ADMIN", roleId: adminRoleB.id, organizationId: orgB.id } });

  const ctrlA = await prisma.control.create({ data: { organizationId: orgA.id, code: "FIND-001", title: "Finding Test Control", status: "IMPLEMENTED", frequency: "QUARTERLY" } });
  controlAId = ctrlA.id;

  const ctrlB = await prisma.control.create({ data: { organizationId: orgB.id, code: "FIND-B01", title: "OrgB Control", status: "IMPLEMENTED", frequency: "MONTHLY" } });
  controlBId = ctrlB.id;

  const riskA = await prisma.risk.create({ data: { organizationId: orgA.id, title: "Finding Test Risk", category: "OPERATIONAL", likelihood: 3, impact: 4, inherentScore: 12, status: "OPEN" } });
  riskAId = riskA.id;

  cookieAdminA = await login("tc-find-admin@a.com");
  cookieViewerA = await login("tc-find-viewer@a.com");
  cookieAdminB = await login("tc-find-admin@b.com");

  console.log("  Setup complete");
}

// TC-121: Manual finding creation (CRITICAL)
async function tc121() {
  console.log("\nTC-121: Create finding from manual source");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({
      title: "Manual Finding One",
      description: "Found during internal review",
      source: "MANUAL",
      severity: "HIGH",
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.title === "Manual Finding One", "title matches");
  assert(body.source === "MANUAL", "source is MANUAL");
  assert(body.severity === "HIGH", "severity is HIGH");
  assert(body.status === "OPEN", "default status is OPEN");
  assert(body.organizationId === orgA.id, "scoped to org");
  findingManualId = body.id;
}

// TC-122: Finding from internal audit (CRITICAL)
async function tc122() {
  console.log("\nTC-122: Create finding from internal audit source");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({
      title: "Audit Finding",
      source: "INTERNAL_AUDIT",
      severity: "CRITICAL",
      controlId: controlAId,
    }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.source === "INTERNAL_AUDIT", "source is INTERNAL_AUDIT");
  assert(body.controlId === controlAId, "linked to control");
  findingAuditId = body.id;
}

// TC-123: Finding from external audit
async function tc123() {
  console.log("\nTC-123: Create finding from external audit");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "External Audit Finding", source: "EXTERNAL_AUDIT", severity: "MEDIUM" }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.source === "EXTERNAL_AUDIT", "source is EXTERNAL_AUDIT");
}

// TC-124: Finding from pentest
async function tc124() {
  console.log("\nTC-124: Create finding from penetration test");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Pentest XSS", source: "PENTEST", severity: "CRITICAL" }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.source === "PENTEST", "source is PENTEST");
}

// TC-125: Finding from vulnerability scan
async function tc125() {
  console.log("\nTC-125: Create finding from vulnerability scan");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "CVE-2024-1234", source: "VULNERABILITY_SCAN", severity: "HIGH" }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.source === "VULNERABILITY_SCAN", "source is VULNERABILITY_SCAN");
}

// TC-126: Finding from risk assessment
async function tc126() {
  console.log("\nTC-126: Create finding from risk assessment");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Risk Gap", source: "RISK_ASSESSMENT", severity: "LOW", riskId: riskAId }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.source === "RISK_ASSESSMENT", "source is RISK_ASSESSMENT");
  assert(body.riskId === riskAId, "linked to risk");
  findingWithRiskId = body.id;
}

// TC-127: Finding independent of controls (CRITICAL)
async function tc127() {
  console.log("\nTC-127: Finding without control or risk link");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Standalone Finding", severity: "MEDIUM" }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.controlId === null, "controlId is null");
  assert(body.riskId === null, "riskId is null");
  findingNoControlId = body.id;
}

// TC-128: Finding linked to control
async function tc128() {
  console.log("\nTC-128: Finding linked to control");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Control Finding", severity: "HIGH", controlId: controlAId }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.controlId === controlAId, "linked to control");
  findingWithControlId = body.id;
}

// TC-129: Status lifecycle OPEN→IN_PROGRESS→RESOLVED→CLOSED (CRITICAL)
async function tc129() {
  console.log("\nTC-129: Full status lifecycle");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Lifecycle Finding", severity: "HIGH" }),
  });
  const f = await r1.json();
  findingLifecycleId = f.id;
  assert(f.status === "OPEN", "starts OPEN");

  const r2 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  const f2 = await r2.json();
  assert(r2.status === 200, "PATCH to IN_PROGRESS succeeds");
  assert(f2.status === "IN_PROGRESS", "status is IN_PROGRESS");

  const r3 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Fixed the issue by patching server" }),
  });
  const f3 = await r3.json();
  assert(r3.status === 200, "PATCH to RESOLVED succeeds");
  assert(f3.status === "RESOLVED", "status is RESOLVED");
  assert(f3.resolvedAt !== null, "resolvedAt is set");

  const r4 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });
  const f4 = await r4.json();
  assert(r4.status === 200, "PATCH to CLOSED succeeds");
  assert(f4.status === "CLOSED", "status is CLOSED");
}

// TC-130: RESOLVED requires resolution
async function tc130() {
  console.log("\nTC-130: RESOLVED requires resolution text");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Needs Resolution", severity: "LOW" }),
  });
  const f = await r1.json();

  const r2 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED" }),
  });
  assert(r2.status === 400, "400 when no resolution provided");

  const r3 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Applied patch" }),
  });
  assert(r3.status === 200, "200 when resolution provided");
}

// TC-131: Overdue detection (CRITICAL)
async function tc131() {
  console.log("\nTC-131: Overdue and due-soon detection");
  const pastDue = new Date(Date.now() - 5 * 86400000).toISOString();
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Overdue Finding", severity: "HIGH", dueDate: pastDue }),
  });
  const f1 = await r1.json();
  findingOverdueId = f1.id;

  const soonDue = new Date(Date.now() + 3 * 86400000).toISOString();
  const r2 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Due Soon Finding", severity: "MEDIUM", dueDate: soonDue }),
  });
  const f2 = await r2.json();
  findingDueSoonId = f2.id;

  const r3 = await api("/api/findings", { cookie: cookieAdminA });
  const list = await r3.json();
  const overdue = list.find((f: any) => f.id === findingOverdueId);
  const dueSoon = list.find((f: any) => f.id === findingDueSoonId);
  assert(overdue?.dueSoonOrOverdue === "OVERDUE", "overdue finding detected");
  assert(dueSoon?.dueSoonOrOverdue === "DUE_SOON", "due-soon finding detected");
}

// TC-132: Finding with owner assignment
async function tc132() {
  console.log("\nTC-132: Assign owner to finding");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Owned Finding", severity: "MEDIUM", ownerId: adminA.id }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created with owner");
  assert(body.ownerId === adminA.id, "owner is set");
}

// TC-133: Cross-tenant owner validation
async function tc133() {
  console.log("\nTC-133: Reject cross-tenant owner");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Bad Owner", severity: "LOW", ownerId: adminB.id }),
  });
  assert(res.status === 400, "400 when owner from different org");
}

// TC-134: RBAC - viewer cannot create findings (CRITICAL)
async function tc134() {
  console.log("\nTC-134: Viewer cannot create findings");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieViewerA,
    body: JSON.stringify({ title: "Viewer Finding", severity: "LOW" }),
  });
  assert(res.status === 403, "403 for viewer creating finding");
}

// TC-135: RBAC - viewer can read findings
async function tc135() {
  console.log("\nTC-135: Viewer can read findings");
  const res = await api("/api/findings", { cookie: cookieViewerA });
  assert(res.status === 200, "200 for viewer reading findings");
  const list = await res.json();
  assert(list.length > 0, "viewer sees findings");
}

// TC-136: RBAC - viewer cannot update findings
async function tc136() {
  console.log("\nTC-136: Viewer cannot update findings");
  const res = await api(`/api/findings/${findingManualId}`, {
    method: "PATCH", cookie: cookieViewerA,
    body: JSON.stringify({ title: "Hacked Title" }),
  });
  assert(res.status === 403, "403 for viewer updating finding");
}

// TC-137: RBAC - viewer cannot delete findings
async function tc137() {
  console.log("\nTC-137: Viewer cannot delete findings");
  const res = await api(`/api/findings/${findingManualId}`, {
    method: "DELETE", cookie: cookieViewerA,
  });
  assert(res.status === 403, "403 for viewer deleting finding");
}

// TC-138: RBAC - FINDINGS_CLOSE required for close transitions
async function tc138() {
  console.log("\nTC-138: Writer without FINDINGS_CLOSE cannot resolve");
  const pw = await hash(PASSWORD, 10);
  const writerRole = await prisma.role.create({
    data: {
      organizationId: orgA.id, name: "Writer No Close",
      permissions: ["controls:read", "findings:read", "findings:write"],
    },
  });
  const writerUser = await prisma.user.create({
    data: { email: "tc-find-writer@a.com", name: "Writer A", passwordHash: pw, role: "EDITOR", roleId: writerRole.id, organizationId: orgA.id },
  });
  const writerCookie = await login("tc-find-writer@a.com");

  const r1 = await api("/api/findings", {
    method: "POST", cookie: writerCookie,
    body: JSON.stringify({ title: "Writer Finding", severity: "LOW" }),
  });
  const f = await r1.json();
  assert(r1.status === 201, "writer can create");

  const r2 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: writerCookie,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Done" }),
  });
  assert(r2.status === 403, "403 without findings:close permission");

  const r3 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: writerCookie,
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  assert(r3.status === 200, "can change to IN_PROGRESS without close perm");

  // Cleanup
  await prisma.finding.deleteMany({ where: { title: "Writer Finding" } });
  await prisma.user.delete({ where: { id: writerUser.id } });
  await prisma.role.delete({ where: { id: writerRole.id } });
}

// TC-139: Cross-tenant isolation (CRITICAL)
async function tc139() {
  console.log("\nTC-139: Cross-tenant isolation");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminB,
    body: JSON.stringify({ title: "OrgB Secret Finding", severity: "CRITICAL" }),
  });
  const fB = await r1.json();
  assert(r1.status === 201, "orgB creates finding");

  const r2 = await api(`/api/findings/${fB.id}`, { cookie: cookieAdminA });
  assert(r2.status === 404, "orgA cannot GET orgB's finding");

  const r3 = await api(`/api/findings/${fB.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Stolen" }),
  });
  assert(r3.status === 404, "orgA cannot PATCH orgB's finding");

  const r4 = await api(`/api/findings/${fB.id}`, { method: "DELETE", cookie: cookieAdminA });
  assert(r4.status === 404, "orgA cannot DELETE orgB's finding");
}

// TC-140: Cross-tenant control link attack
async function tc140() {
  console.log("\nTC-140: Cannot link finding to another org's control");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Link Attack", severity: "LOW", controlId: controlBId }),
  });
  assert(res.status === 400, "400 linking to cross-tenant control");
}

// TC-141: Closed findings are immutable (CRITICAL)
async function tc141() {
  console.log("\nTC-141: Closed findings cannot be modified");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "To Close", severity: "LOW" }),
  });
  const f = await r1.json();
  await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Done" }),
  });
  await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });
  findingClosedId = f.id;

  const r2 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Modified Closed" }),
  });
  assert(r2.status === 400, "400 when modifying closed finding");
  const body = await r2.json();
  assert((body.error || body.message || "").includes("Closed"), "error mentions closed");
}

// TC-142: Search/filter findings (CRITICAL)
async function tc142() {
  console.log("\nTC-142: Filter findings by status, severity, source, search");
  const r1 = await api("/api/findings?status=OPEN", { cookie: cookieAdminA });
  const open = await r1.json();
  assert(r1.status === 200, "filter by status=OPEN");
  assert(open.every((f: any) => f.status === "OPEN"), "all results are OPEN");

  const r2 = await api("/api/findings?severity=CRITICAL", { cookie: cookieAdminA });
  const crit = await r2.json();
  assert(crit.every((f: any) => f.severity === "CRITICAL"), "all results are CRITICAL");

  const r3 = await api("/api/findings?source=PENTEST", { cookie: cookieAdminA });
  const pentest = await r3.json();
  assert(pentest.length >= 1, "at least one PENTEST finding");
  assert(pentest.every((f: any) => f.source === "PENTEST"), "all results are PENTEST source");

  const r4 = await api("/api/findings?search=XSS", { cookie: cookieAdminA });
  const xss = await r4.json();
  assert(xss.length >= 1, "search finds XSS finding");
}

// TC-143: Delete finding
async function tc143() {
  console.log("\nTC-143: Delete finding");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "To Delete", severity: "LOW" }),
  });
  const f = await r1.json();
  findingDeleteId = f.id;

  const r2 = await api(`/api/findings/${f.id}`, { method: "DELETE", cookie: cookieAdminA });
  assert(r2.status === 200, "200 on delete");

  const r3 = await api(`/api/findings/${f.id}`, { cookie: cookieAdminA });
  assert(r3.status === 404, "404 after delete");
}

// TC-144: Validation - title required
async function tc144() {
  console.log("\nTC-144: Validation - title required and bounded");
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ severity: "LOW" }),
  });
  assert(r1.status === 400, "400 when title missing");

  const r2 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "", severity: "LOW" }),
  });
  assert(r2.status === 400, "400 when title empty");

  const r3 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "x".repeat(301), severity: "LOW" }),
  });
  assert(r3.status === 400, "400 when title > 300 chars");
}

// TC-145: Validation - invalid severity
async function tc145() {
  console.log("\nTC-145: Validation - invalid severity rejected");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Bad Severity", severity: "EXTREME" }),
  });
  assert(res.status === 400, "400 for invalid severity");
}

// TC-146: Validation - invalid source
async function tc146() {
  console.log("\nTC-146: Validation - invalid source rejected");
  const res = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Bad Source", source: "MAGIC" }),
  });
  assert(res.status === 400, "400 for invalid source");
}

// TC-147: GET single finding with relations
async function tc147() {
  console.log("\nTC-147: GET single finding includes control and risk");
  const res = await api(`/api/findings/${findingWithControlId}`, { cookie: cookieAdminA });
  const body = await res.json();
  assert(res.status === 200, "200 on GET");
  assert(body.control !== null, "control relation included");
  assert(body.control.code === "FIND-001", "control code correct");
}

// TC-148: Audit trail on create (CRITICAL)
async function tc148() {
  console.log("\nTC-148: Audit trail for finding creation");
  const res = await api(`/api/audit-logs?entityType=Finding&entityId=${findingManualId}`, { cookie: cookieAdminA });
  const logs = await res.json();
  assert(res.status === 200, "audit logs fetched");
  const createLog = logs.find((l: any) => l.action === "CREATE" && l.entityId === findingManualId);
  assert(createLog !== undefined, "CREATE audit log exists");
  assert(createLog.entityType === "Finding", "entityType is Finding");
}

// TC-149: Audit trail on update
async function tc149() {
  console.log("\nTC-149: Audit trail for finding update");
  const res = await api(`/api/audit-logs?entityType=Finding&entityId=${findingLifecycleId}`, { cookie: cookieAdminA });
  const logs = await res.json();
  const updates = logs.filter((l: any) => l.action === "UPDATE");
  assert(updates.length >= 2, "multiple UPDATE audit logs for lifecycle finding");
}

// TC-150: Audit trail on delete (CRITICAL)
async function tc150() {
  console.log("\nTC-150: Audit trail for finding deletion");
  const res = await api(`/api/audit-logs?entityType=Finding&entityId=${findingDeleteId}`, { cookie: cookieAdminA });
  const logs = await res.json();
  const deleteLog = logs.find((l: any) => l.action === "DELETE");
  assert(deleteLog !== undefined, "DELETE audit log exists");
}

// TC-151: Severity update
async function tc151() {
  console.log("\nTC-151: Update finding severity");
  const res = await api(`/api/findings/${findingManualId}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ severity: "CRITICAL" }),
  });
  const body = await res.json();
  assert(res.status === 200, "200 on severity update");
  assert(body.severity === "CRITICAL", "severity updated to CRITICAL");
}

// TC-152: Update finding to link/unlink control
async function tc152() {
  console.log("\nTC-152: Link and unlink control from finding");
  const r1 = await api(`/api/findings/${findingNoControlId}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlId: controlAId }),
  });
  const f1 = await r1.json();
  assert(f1.controlId === controlAId, "control linked");

  const r2 = await api(`/api/findings/${findingNoControlId}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlId: null }),
  });
  const f2 = await r2.json();
  assert(f2.controlId === null, "control unlinked");
}

// TC-153: End-to-end workflow (CRITICAL)
async function tc153() {
  console.log("\nTC-153: End-to-end finding lifecycle workflow");
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString();
  const r1 = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({
      title: "E2E SQL Injection",
      description: "Found SQL injection in login form",
      source: "PENTEST",
      severity: "CRITICAL",
      controlId: controlAId,
      riskId: riskAId,
      ownerId: adminA.id,
      dueDate,
    }),
  });
  const f = await r1.json();
  findingE2EId = f.id;
  assert(r1.status === 201, "1. created with all fields");
  assert(f.source === "PENTEST", "1. source correct");
  assert(f.controlId === controlAId, "1. control linked");
  assert(f.riskId === riskAId, "1. risk linked");
  assert(f.ownerId === adminA.id, "1. owner set");

  const r2 = await api("/api/findings?source=PENTEST&severity=CRITICAL", { cookie: cookieAdminA });
  const list = await r2.json();
  const found = list.find((x: any) => x.id === f.id);
  assert(found !== undefined, "2. appears in filtered list");

  const r3 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "IN_PROGRESS" }),
  });
  assert((await r3.json()).status === "IN_PROGRESS", "3. status IN_PROGRESS");

  const r4 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Parameterized all SQL queries" }),
  });
  const f4 = await r4.json();
  assert(f4.status === "RESOLVED", "4. status RESOLVED");
  assert(f4.resolvedAt !== null, "4. resolvedAt set");

  const r5 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });
  assert((await r5.json()).status === "CLOSED", "5. status CLOSED");

  const r6 = await api(`/api/findings/${f.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Should Fail" }),
  });
  assert(r6.status === 400, "6. closed finding immutable");

  const r7 = await api(`/api/audit-logs?entityType=Finding&entityId=${f.id}`, { cookie: cookieAdminA });
  const logs = await r7.json();
  assert(logs.length >= 4, "7. full audit trail (create + 3 updates)");
}

async function cleanup() {
  const orgIds = [orgA.id, orgB.id].filter(Boolean);
  if (orgIds.length === 0) return;
  await prisma.finding.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.controlTest.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
  await prisma.evidence.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
  await prisma.controlMapping.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
  await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.risk.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function run() {
  try {
    await setup();
    await tc121(); await tc122(); await tc123(); await tc124();
    await tc125(); await tc126(); await tc127(); await tc128();
    await tc129(); await tc130(); await tc131(); await tc132();
    await tc133(); await tc134(); await tc135(); await tc136();
    await tc137(); await tc138(); await tc139(); await tc140();
    await tc141(); await tc142(); await tc143(); await tc144();
    await tc145(); await tc146(); await tc147(); await tc148();
    await tc149(); await tc150(); await tc151(); await tc152();
    await tc153();
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
