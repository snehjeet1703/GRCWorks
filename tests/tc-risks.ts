/**
 * Risk Management & Risk Treatment test cases TC-154 through TC-188
 * Run: npx tsx tests/tc-risks.ts
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

let risk001Id = "";
let risk002Id = "";
let action1Id = "";
let action2Id = "";
let action3Id = "";

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

  await prisma.user.deleteMany({ where: { email: { in: ["tc-risk-admin@a.com", "tc-risk-editor@a.com", "tc-risk-viewer@a.com", "tc-risk-admin@b.com"] } } });
  await prisma.organization.deleteMany({ where: { slug: { in: ["tc-risks-a", "tc-risks-b"] } } });

  orgA = await prisma.organization.create({ data: { name: "RisksA", slug: "tc-risks-a", onboardingComplete: true } });
  orgB = await prisma.organization.create({ data: { name: "RisksB", slug: "tc-risks-b", onboardingComplete: true } });

  const adminRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true } });
  const editorRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Editor", description: "Edit", permissions: BUILT_IN_ROLES.find(r => r.name === "Compliance Manager")!.permissions, isBuiltIn: true } });
  const viewerRoleA = await prisma.role.create({ data: { organizationId: orgA.id, name: "Viewer", description: "Read-only", permissions: BUILT_IN_ROLES.find(r => r.name === "Viewer")!.permissions, isBuiltIn: true } });
  const adminRoleB = await prisma.role.create({ data: { organizationId: orgB.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true } });

  adminA = await prisma.user.create({ data: { email: "tc-risk-admin@a.com", name: "RiskAdmin A", passwordHash: pw, role: "ADMIN", roleId: adminRoleA.id, organizationId: orgA.id } });
  editorA = await prisma.user.create({ data: { email: "tc-risk-editor@a.com", name: "RiskEditor A", passwordHash: pw, role: "EDITOR", roleId: editorRoleA.id, organizationId: orgA.id } });
  viewerA = await prisma.user.create({ data: { email: "tc-risk-viewer@a.com", name: "RiskViewer A", passwordHash: pw, role: "VIEWER", roleId: viewerRoleA.id, organizationId: orgA.id } });
  adminB = await prisma.user.create({ data: { email: "tc-risk-admin@b.com", name: "RiskAdmin B", passwordHash: pw, role: "ADMIN", roleId: adminRoleB.id, organizationId: orgB.id } });

  const c1 = await prisma.control.create({ data: { organizationId: orgA.id, code: "RCTRL-001", title: "Access Review", status: "IMPLEMENTED", frequency: "QUARTERLY" } });
  const c2 = await prisma.control.create({ data: { organizationId: orgA.id, code: "RCTRL-002", title: "MFA Enforcement", status: "IMPLEMENTED", frequency: "MONTHLY" } });
  const c3 = await prisma.control.create({ data: { organizationId: orgA.id, code: "RCTRL-003", title: "Privilege Management", status: "IMPLEMENTED", frequency: "QUARTERLY" } });
  const cB = await prisma.control.create({ data: { organizationId: orgB.id, code: "RCTRL-B01", title: "OrgB Control", status: "IMPLEMENTED", frequency: "MONTHLY" } });
  ctrl001Id = c1.id; ctrl002Id = c2.id; ctrl003Id = c3.id; ctrlBId = cB.id;

  cookieAdminA = await login("tc-risk-admin@a.com");
  cookieEditorA = await login("tc-risk-editor@a.com");
  cookieViewerA = await login("tc-risk-viewer@a.com");
  cookieAdminB = await login("tc-risk-admin@b.com");
  console.log("  Setup complete");
}

// TC-154: Create a risk (CRITICAL)
async function tc154() {
  console.log("\nTC-154: Create a risk");
  const res = await api("/api/risks", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({
      title: "Unauthorized access to production systems",
      description: "Unauthorized users may gain access to production systems and sensitive customer data.",
      category: "Access Control",
      likelihood: 4, impact: 5,
      treatment: "MITIGATE",
      ownerId: adminA.id,
    }),
  });
  const body = await res.json();
  assert(res.status === 201, "201 created");
  assert(body.id !== undefined, "has ID");
  assert(body.ownerId === adminA.id, "owner set");
  assert(body.likelihood === 4, "likelihood=4");
  assert(body.impact === 5, "impact=5");
  assert(body.treatment === "MITIGATE", "treatment=MITIGATE");
  assert(body.organizationId === orgA.id, "scoped to org");
  risk001Id = body.id;
}

// TC-155: Risk score calculation (CRITICAL)
async function tc155() {
  console.log("\nTC-155: Risk score calculation");
  const res = await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA });
  const body = await res.json();
  assert(body.inherentScore === 20, "inherentScore = 4×5 = 20");
  // Rating: CRITICAL (20-25), HIGH (12-19), MEDIUM (5-11), LOW (1-4)
  const rating = body.inherentScore >= 20 ? "CRITICAL" : body.inherentScore >= 12 ? "HIGH" : body.inherentScore >= 5 ? "MEDIUM" : "LOW";
  assert(rating === "CRITICAL", "rating is CRITICAL for score 20");
}

// TC-156: Risk matrix — all 25 combinations
async function tc156() {
  console.log("\nTC-156: Risk matrix (25 combinations)");
  let allCorrect = true;
  for (let l = 1; l <= 5; l++) {
    for (let i = 1; i <= 5; i++) {
      const r = await api("/api/risks", {
        method: "POST", cookie: cookieAdminA,
        body: JSON.stringify({ title: `Matrix ${l}x${i}`, likelihood: l, impact: i }),
      });
      const b = await r.json();
      if (b.inherentScore !== l * i) { allCorrect = false; console.error(`    ✗ ${l}×${i} expected ${l*i} got ${b.inherentScore}`); }
    }
  }
  assert(allCorrect, "all 25 L×I combinations produce correct score");
}

// TC-157: Invalid likelihood
async function tc157() {
  console.log("\nTC-157: Invalid likelihood/impact");
  const r1 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Bad", likelihood: 0, impact: 3 }) });
  assert(r1.status === 400, "likelihood=0 rejected");
  const r2 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Bad", likelihood: 6, impact: 3 }) });
  assert(r2.status === 400, "likelihood=6 rejected");
  const r3 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Bad", likelihood: 3, impact: 0 }) });
  assert(r3.status === 400, "impact=0 rejected");
  const r4 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Bad", likelihood: 3, impact: 6 }) });
  assert(r4.status === 400, "impact=6 rejected");
}

// TC-158: Negative risk values
async function tc158() {
  console.log("\nTC-158: Negative risk values");
  const r1 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Neg", likelihood: -1, impact: 3 }) });
  assert(r1.status === 400, "likelihood=-1 rejected");
  const r2 = await api("/api/risks", { method: "POST", cookie: cookieAdminA, body: JSON.stringify({ title: "Neg", likelihood: 3, impact: -5 }) });
  assert(r2.status === 400, "impact=-5 rejected");
}

// TC-159: Link risk to control
async function tc159() {
  console.log("\nTC-159: Link risk to control");
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrl001Id] }),
  });
  assert(r.status === 200, "PATCH succeeds");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.controls.length === 1, "1 control linked");
  assert(detail.controls[0].control.code === "RCTRL-001", "control code correct");
}

// TC-160: Link one risk to multiple controls (CRITICAL)
async function tc160() {
  console.log("\nTC-160: Link risk to multiple controls");
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id, ctrl003Id] }),
  });
  assert(r.status === 200, "PATCH succeeds");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.controls.length === 3, "3 controls linked");
}

// TC-161: One control linked to multiple risks (CRITICAL)
async function tc161() {
  console.log("\nTC-161: One control linked to multiple risks");
  const r1 = await api("/api/risks", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Data leakage", likelihood: 3, impact: 4, controlIds: [ctrl001Id] }),
  });
  const r2 = await r1.json();
  risk002Id = r2.id;
  assert(r1.status === 201, "risk2 created with ctrl001");
  // risk001 also has ctrl001
  const detail1 = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  const detail2 = await (await api(`/api/risks/${risk002Id}`, { cookie: cookieAdminA })).json();
  assert(detail1.controls.some((c: any) => c.control.id === ctrl001Id), "risk1 has ctrl001");
  assert(detail2.controls.some((c: any) => c.control.id === ctrl001Id), "risk2 has ctrl001");
}

// TC-162: Duplicate risk-control mapping
async function tc162() {
  console.log("\nTC-162: Duplicate risk-control mapping prevented");
  // Set same controls again — should be idempotent
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id, ctrl003Id] }),
  });
  assert(r.status === 200, "PATCH succeeds (idempotent)");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.controls.length === 3, "still exactly 3 controls (no duplicates)");
}

// TC-163: Remove risk-control mapping
async function tc163() {
  console.log("\nTC-163: Remove risk-control mapping");
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrl002Id, ctrl003Id] }),
  });
  assert(r.status === 200, "PATCH removes ctrl001");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.controls.length === 2, "2 controls remain");
  assert(!detail.controls.some((c: any) => c.control.id === ctrl001Id), "ctrl001 removed");
  // Verify ctrl001 still exists
  const ctrl = await prisma.control.findUnique({ where: { id: ctrl001Id } });
  assert(ctrl !== null, "control still exists after unlink");
}

// TC-164: Set treatment to MITIGATE
async function tc164() {
  console.log("\nTC-164: Treatment strategy");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.treatment === "MITIGATE", "treatment is MITIGATE");
  assert(detail.status === "OPEN", "status still OPEN (not auto-mitigated)");
}

// TC-165: Create Risk Action (CRITICAL)
async function tc165() {
  console.log("\nTC-165: Create risk action");
  const dueDate = new Date("2026-09-30T00:00:00.000Z").toISOString();
  const r = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Review privileged production accounts", ownerId: editorA.id, dueDate }),
  });
  const body = await r.json();
  assert(r.status === 201, "201 created");
  assert(body.action === "Review privileged production accounts", "action text correct");
  assert(body.ownerId === editorA.id, "owner assigned");
  assert(body.status === "PENDING", "default status PENDING");
  action1Id = body.id;
}

// TC-166: Multiple Risk Actions (CRITICAL)
async function tc166() {
  console.log("\nTC-166: Multiple risk actions");
  const r2 = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Remove dormant accounts", dueDate: new Date("2026-09-30T00:00:00.000Z").toISOString() }),
  });
  action2Id = (await r2.json()).id;
  const r3 = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Implement quarterly review", dueDate: new Date("2026-10-15T00:00:00.000Z").toISOString() }),
  });
  action3Id = (await r3.json()).id;

  const list = await (await api(`/api/risks/${risk001Id}/actions`, { cookie: cookieAdminA })).json();
  assert(list.length === 3, "3 actions exist");

  // Complete action1 — others should remain independent
  await api(`/api/risks/${risk001Id}/actions`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ actionId: action1Id, status: "COMPLETED", notes: "Reviewed all accounts" }),
  });
  const list2 = await (await api(`/api/risks/${risk001Id}/actions`, { cookie: cookieAdminA })).json();
  const completed = list2.filter((a: any) => a.status === "COMPLETED").length;
  const pending = list2.filter((a: any) => a.status === "PENDING").length;
  assert(completed === 1, "only 1 completed");
  assert(pending === 2, "2 still pending");
}

// TC-167: Risk Action ownership
async function tc167() {
  console.log("\nTC-167: Risk action ownership");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  const act = detail.actions.find((a: any) => a.id === action1Id);
  assert(act?.ownerId === editorA.id, "action owned by editorA");
}

// TC-168: Cross-tenant Risk Action owner
async function tc168() {
  console.log("\nTC-168: Reject cross-tenant risk action owner");
  const r = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Bad owner action", ownerId: adminB.id }),
  });
  assert(r.status === 400, "400 cross-tenant owner rejected");
}

// TC-169: Complete Risk Action
async function tc169() {
  console.log("\nTC-169: Complete risk action");
  const r = await api(`/api/risks/${risk001Id}/actions`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ actionId: action2Id, status: "COMPLETED", notes: "All dormant accounts removed." }),
  });
  const body = await r.json();
  assert(r.status === 200, "200 updated");
  assert(body.status === "COMPLETED", "status is COMPLETED");
  assert(body.completedAt !== null, "completedAt set");
  assert(body.notes.includes("dormant"), "notes retained");
}

// TC-170: Overdue Risk Action (CRITICAL)
async function tc170() {
  console.log("\nTC-170: Overdue risk action");
  const pastDue = new Date(Date.now() - 2 * 86400000).toISOString();
  const r = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Overdue action", dueDate: pastDue }),
  });
  const body = await r.json();
  assert(r.status === 201, "created overdue action");
  assert(new Date(body.dueDate) < new Date(), "due date is in the past");
  assert(body.status === "PENDING", "status still PENDING (overdue)");
}

// TC-171: Risk Action due soon
async function tc171() {
  console.log("\nTC-171: Risk action due soon");
  const soonDue = new Date(Date.now() + 3 * 86400000).toISOString();
  const r = await api(`/api/risks/${risk001Id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Due soon action", dueDate: soonDue }),
  });
  const body = await r.json();
  assert(r.status === 201, "created due-soon action");
  const diff = (new Date(body.dueDate).getTime() - Date.now()) / 86400000;
  assert(diff <= 7 && diff > 0, "due within warning period");
}

// TC-172: Risk remains open after action completion (CRITICAL)
async function tc172() {
  console.log("\nTC-172: Risk remains open after partial action completion");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.status === "OPEN", "risk still OPEN despite completed actions");
  const openActions = detail.actions.filter((a: any) => a.status !== "COMPLETED" && a.status !== "CANCELLED");
  assert(openActions.length > 0, "some actions still open");
}

// TC-173: Close Risk
async function tc173() {
  console.log("\nTC-173: Close risk");
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });
  const body = await r.json();
  assert(r.status === 200, "risk closed");
  assert(body.status === "CLOSED", "status is CLOSED");
}

// TC-174: Reopen risk (verify it's not permanently locked)
async function tc174() {
  console.log("\nTC-174: Reopen closed risk");
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "OPEN" }),
  });
  assert(r.status === 200, "risk reopened");
}

// TC-175: Residual risk (CRITICAL)
async function tc175() {
  console.log("\nTC-175: Residual risk");
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.inherentScore === 20, "inherent score is 20");
  // Set residual score
  const r = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ residualScore: 10 }),
  });
  const body = await r.json();
  assert(body.inherentScore === 20, "inherent score preserved");
  assert(body.residualScore === 10, "residual score updated to 10");
}

// TC-176: Control affects residual risk
async function tc176() {
  console.log("\nTC-176: Control presence does not auto-change residual risk");
  // Re-link ctrl001
  await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrl001Id, ctrl002Id, ctrl003Id] }),
  });
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.residualScore === 10, "residual score NOT auto-changed by adding controls");
}

// TC-177: Failed control affects risk posture (CRITICAL)
async function tc177() {
  console.log("\nTC-177: Failed control visible on risk");
  // Create a FAIL test for ctrl001
  await api(`/api/controls/${ctrl001Id}/tests`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ result: "FAIL", testDate: new Date().toISOString(), notes: "Failed test" }),
  });
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  const failingCtrl = detail.controls.find((c: any) => c.control.id === ctrl001Id);
  assert(failingCtrl?.control.tests[0]?.result === "FAIL", "risk shows control's latest test as FAIL");
}

// TC-178: Open finding affects risk (CRITICAL)
async function tc178() {
  console.log("\nTC-178: Open finding visible on risk");
  await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Critical vuln on risk", severity: "CRITICAL", controlId: ctrl001Id, riskId: risk001Id }),
  });
  const detail = await (await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminA })).json();
  assert(detail.findings.length >= 1, "findings appear on risk detail");
  assert(detail.findings.some((f: any) => f.title === "Critical vuln on risk"), "specific finding visible");
}

// TC-179: Risk search
async function tc179() {
  console.log("\nTC-179: Risk search");
  const r = await api("/api/risks?search=unauthorized+access", { cookie: cookieAdminA });
  const list = await r.json();
  assert(list.some((r: any) => r.id === risk001Id), "search by title finds risk");

  const r2 = await api("/api/risks?search=production+systems", { cookie: cookieAdminA });
  const list2 = await r2.json();
  assert(list2.some((r: any) => r.id === risk001Id), "search by description finds risk");
}

// TC-180: Risk filters
async function tc180() {
  console.log("\nTC-180: Risk filters");
  const r1 = await api("/api/risks?status=OPEN", { cookie: cookieAdminA });
  const open = await r1.json();
  assert(open.every((r: any) => r.status === "OPEN"), "filter by status=OPEN");

  const r2 = await api("/api/risks?category=Access+Control", { cookie: cookieAdminA });
  const cat = await r2.json();
  assert(cat.some((r: any) => r.category === "Access Control"), "filter by category");

  const r3 = await api("/api/risks?treatment=MITIGATE", { cookie: cookieAdminA });
  const mit = await r3.json();
  assert(mit.every((r: any) => r.treatment === "MITIGATE"), "filter by treatment");
}

// TC-181: Risk sorting
async function tc181() {
  console.log("\nTC-181: Risk sorting");
  const r1 = await api("/api/risks?sort=highest", { cookie: cookieAdminA });
  const highest = await r1.json();
  let sorted = true;
  for (let i = 1; i < highest.length; i++) {
    if (highest[i].inherentScore > highest[i-1].inherentScore) { sorted = false; break; }
  }
  assert(sorted, "sort=highest works (desc by score)");

  const r2 = await api("/api/risks?sort=lowest", { cookie: cookieAdminA });
  const lowest = await r2.json();
  sorted = true;
  for (let i = 1; i < lowest.length; i++) {
    if (lowest[i].inherentScore < lowest[i-1].inherentScore) { sorted = false; break; }
  }
  assert(sorted, "sort=lowest works (asc by score)");
}

// TC-182: Risk dashboard counts
async function tc182() {
  console.log("\nTC-182: Risk dashboard counts");
  // We have 25 matrix risks + risk001 + risk002 = many risks
  const all = await (await api("/api/risks", { cookie: cookieAdminA })).json();
  const critical = all.filter((r: any) => r.inherentScore >= 20).length;
  const high = all.filter((r: any) => r.inherentScore >= 12 && r.inherentScore <= 19).length;
  const medium = all.filter((r: any) => r.inherentScore >= 5 && r.inherentScore <= 11).length;
  const low = all.filter((r: any) => r.inherentScore >= 1 && r.inherentScore <= 4).length;
  assert(critical > 0, `${critical} critical risks`);
  assert(high > 0, `${high} high risks`);
  assert(medium > 0, `${medium} medium risks`);
  assert(low > 0, `${low} low risks`);
  assert(critical + high + medium + low === all.length, "all risks categorized");
}

// TC-183: Viewer permissions (CRITICAL implied)
async function tc183() {
  console.log("\nTC-183: Viewer permissions");
  const r1 = await api("/api/risks", { method: "POST", cookie: cookieViewerA, body: JSON.stringify({ title: "V", likelihood: 1, impact: 1 }) });
  assert(r1.status === 403, "viewer cannot create risk");
  const r2 = await api(`/api/risks/${risk001Id}`, { method: "PATCH", cookie: cookieViewerA, body: JSON.stringify({ title: "Hack" }) });
  assert(r2.status === 403, "viewer cannot edit risk");
  const r3 = await api(`/api/risks/${risk001Id}`, { method: "DELETE", cookie: cookieViewerA });
  assert(r3.status === 403, "viewer cannot delete risk");
  const r4 = await api(`/api/risks/${risk001Id}/actions`, { method: "POST", cookie: cookieViewerA, body: JSON.stringify({ action: "V" }) });
  assert(r4.status === 403, "viewer cannot create risk action");
  // Viewer CAN read
  const r5 = await api("/api/risks", { cookie: cookieViewerA });
  assert(r5.status === 200, "viewer can read risks");
}

// TC-184: Cross-tenant risk access (CRITICAL)
async function tc184() {
  console.log("\nTC-184: Cross-tenant risk access");
  const r1 = await api(`/api/risks/${risk001Id}`, { cookie: cookieAdminB });
  assert(r1.status === 404, "orgB cannot view orgA risk");
  const r2 = await api(`/api/risks/${risk001Id}`, { method: "PATCH", cookie: cookieAdminB, body: JSON.stringify({ title: "Stolen" }) });
  assert(r2.status === 404, "orgB cannot edit orgA risk");
  const r3 = await api(`/api/risks/${risk001Id}`, { method: "DELETE", cookie: cookieAdminB });
  assert(r3.status === 404, "orgB cannot delete orgA risk");
  const r4 = await api(`/api/risks/${risk001Id}/actions`, { cookie: cookieAdminB });
  assert(r4.status === 404, "orgB cannot view orgA risk actions");
}

// TC-185: Cross-tenant relationship attack (CRITICAL)
async function tc185() {
  console.log("\nTC-185: Cross-tenant relationship attacks");
  const r1 = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ controlIds: [ctrlBId] }),
  });
  assert(r1.status === 400, "cannot link orgB control to orgA risk");

  const r2 = await api(`/api/risks/${risk001Id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ ownerId: adminB.id }),
  });
  assert(r2.status === 400, "cannot set orgB user as orgA risk owner");
}

// TC-186: Risk deletion
async function tc186() {
  console.log("\nTC-186: Risk deletion");
  // Create a risk with controls, actions, findings
  const cr = await api("/api/risks", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "To Delete Risk", likelihood: 2, impact: 2, controlIds: [ctrl001Id] }),
  });
  const delRisk = await cr.json();
  await api(`/api/risks/${delRisk.id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Delete test action" }),
  });
  await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "Delete test finding", severity: "LOW", riskId: delRisk.id }),
  });

  const r = await api(`/api/risks/${delRisk.id}`, { method: "DELETE", cookie: cookieAdminA });
  assert(r.status === 200, "risk deleted");

  // Verify no orphaned records — control still exists
  const ctrl = await prisma.control.findUnique({ where: { id: ctrl001Id } });
  assert(ctrl !== null, "control not orphaned");

  // RiskControl junction records should be gone (cascade)
  const junctions = await prisma.riskControl.findMany({ where: { riskId: delRisk.id } });
  assert(junctions.length === 0, "no orphaned RiskControl");

  // RiskActions should be gone (cascade)
  const actions = await prisma.riskAction.findMany({ where: { riskId: delRisk.id } });
  assert(actions.length === 0, "no orphaned RiskAction");
}

// TC-187: Risk audit (CRITICAL)
async function tc187() {
  console.log("\nTC-187: Risk audit trail");
  const logs = await (await api(`/api/audit-logs?entityType=Risk&entityId=${risk001Id}`, { cookie: cookieAdminA })).json();
  const creates = logs.filter((l: any) => l.action === "CREATE");
  const updates = logs.filter((l: any) => l.action === "UPDATE");
  assert(creates.length >= 1, "CREATE audit log exists");
  assert(updates.length >= 3, "multiple UPDATE audit logs (controls, residual, status changes)");

  // Also check RiskAction audit
  const actionLogs = await (await api(`/api/audit-logs?entityType=RiskAction`, { cookie: cookieAdminA })).json();
  assert(actionLogs.length >= 1, "RiskAction audit logs exist");
}

// TC-188: Full Risk lifecycle (CRITICAL)
async function tc188() {
  console.log("\nTC-188: Full risk lifecycle");

  // 1. Risk identified
  const r1 = await api("/api/risks", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({
      title: "E2E: Unpatched servers", description: "Critical servers not receiving patches",
      category: "Vulnerability Management", likelihood: 4, impact: 4,
      treatment: "MITIGATE", ownerId: adminA.id,
      controlIds: [ctrl001Id],
    }),
  });
  const risk = await r1.json();
  assert(r1.status === 201, "1. risk created");
  assert(risk.inherentScore === 16, "2. inherent score = 16");

  // 3. Controls identified (already linked)
  const detail1 = await (await api(`/api/risks/${risk.id}`, { cookie: cookieAdminA })).json();
  assert(detail1.controls.length === 1, "3. control linked");

  // 4. Treatment = MITIGATE
  assert(detail1.treatment === "MITIGATE", "4. treatment is MITIGATE");

  // 5. Risk Actions created
  const a1 = await api(`/api/risks/${risk.id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Deploy patch management system", dueDate: new Date(Date.now() + 14 * 86400000).toISOString(), ownerId: editorA.id }),
  });
  const a2 = await api(`/api/risks/${risk.id}/actions`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ action: "Patch all critical servers", dueDate: new Date(Date.now() + 30 * 86400000).toISOString() }),
  });
  const act1 = await a1.json();
  const act2 = await a2.json();
  assert(a1.status === 201 && a2.status === 201, "5. actions created");

  // 6. Actions completed
  await api(`/api/risks/${risk.id}/actions`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ actionId: act1.id, status: "COMPLETED", notes: "Deployed" }),
  });
  await api(`/api/risks/${risk.id}/actions`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ actionId: act2.id, status: "COMPLETED", notes: "All patched" }),
  });
  const actList = await (await api(`/api/risks/${risk.id}/actions`, { cookie: cookieAdminA })).json();
  assert(actList.every((a: any) => a.status === "COMPLETED"), "6. all actions completed");

  // 7. Control tested (PASS)
  await api(`/api/controls/${ctrl001Id}/tests`, {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ result: "PASS", testDate: new Date().toISOString(), notes: "Passed after patching" }),
  });

  // 8. Finding resolved
  const findRes = await api("/api/findings", {
    method: "POST", cookie: cookieAdminA,
    body: JSON.stringify({ title: "E2E patch finding", severity: "HIGH", riskId: risk.id }),
  });
  const finding = await findRes.json();
  await api(`/api/findings/${finding.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "RESOLVED", resolution: "Patched" }),
  });
  await api(`/api/findings/${finding.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });

  // 9. Residual risk assessed
  await api(`/api/risks/${risk.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ residualScore: 4 }),
  });
  const detail2 = await (await api(`/api/risks/${risk.id}`, { cookie: cookieAdminA })).json();
  assert(detail2.inherentScore === 16, "9. inherent score preserved at 16");
  assert(detail2.residualScore === 4, "9. residual score reduced to 4");

  // 10. Risk closed
  await api(`/api/risks/${risk.id}`, {
    method: "PATCH", cookie: cookieAdminA,
    body: JSON.stringify({ status: "CLOSED" }),
  });
  const final = await (await api(`/api/risks/${risk.id}`, { cookie: cookieAdminA })).json();
  assert(final.status === "CLOSED", "10. risk closed");

  // 11. Verify full audit trail
  const logs = await (await api(`/api/audit-logs?entityType=Risk&entityId=${risk.id}`, { cookie: cookieAdminA })).json();
  assert(logs.length >= 3, "11. complete audit trail");
}

async function cleanup() {
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean);
  if (orgIds.length === 0) return;
  await prisma.finding.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.riskAction.deleteMany({ where: { risk: { organizationId: { in: orgIds } } } });
  await prisma.riskControl.deleteMany({ where: { risk: { organizationId: { in: orgIds } } } });
  await prisma.controlTest.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
  await prisma.risk.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function run() {
  try {
    await setup();
    await tc154(); await tc155(); await tc156(); await tc157();
    await tc158(); await tc159(); await tc160(); await tc161();
    await tc162(); await tc163(); await tc164(); await tc165();
    await tc166(); await tc167(); await tc168(); await tc169();
    await tc170(); await tc171(); await tc172(); await tc173();
    await tc174(); await tc175(); await tc176(); await tc177();
    await tc178(); await tc179(); await tc180(); await tc181();
    await tc182(); await tc183(); await tc184(); await tc185();
    await tc186(); await tc187(); await tc188();
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
