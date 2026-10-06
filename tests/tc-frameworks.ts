/**
 * Framework → Requirement → Control Mapping test cases TC-26 through TC-54
 * Run: npx tsx tests/tc-frameworks.ts
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

// Framework + requirement IDs
let soc2Id = "";
let iso27001Id = "";
let cc61Id = "";
let cc62Id = "";
let cc72Id = "";
let a515Id = "";
let a516Id = "";
let a816Id = "";

// Org B framework
let soc2BId = "";
let cc61BId = "";

// Control IDs
let ctrl001Id = "";
let ctrl002Id = "";
let ctrl003Id = "";

// Mapping IDs
let mapping_cc61_ctrl001 = "";
let mapping_cc62_ctrl001 = "";
let mapping_a515_ctrl001 = "";
let mapping_cc61_ctrl002 = "";

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
  if (!sessionCookie) throw new Error(`Login failed for ${email}`);
  return sessionCookie;
}

async function api(method: string, path: string, cookie: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json", cookie } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function setup() {
  console.log("\n═══ SETUP ═══\n");
  const pw = await hash(PASSWORD, 10);

  // Clean prior test data
  await prisma.user.deleteMany({ where: { email: { in: ["admina2@test.com", "viewera2@test.com", "adminb2@test.com"] } } });
  await prisma.organization.deleteMany({ where: { slug: { in: ["acme-fw-test", "beta-fw-test"] } } });

  const { BUILT_IN_ROLES } = await import("../src/lib/permissions");

  // Org A
  orgA = await prisma.organization.create({ data: { name: "Acme Corp FW", slug: "acme-fw-test", onboardingComplete: true } });
  const adminRoleA = await prisma.role.create({
    data: { organizationId: orgA.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true },
  });
  const viewerRoleA = await prisma.role.create({
    data: { organizationId: orgA.id, name: "Viewer", description: "Read-only", permissions: BUILT_IN_ROLES.find(r => r.name === "Viewer")!.permissions, isBuiltIn: true },
  });

  adminA = await prisma.user.create({ data: { email: "admina2@test.com", name: "Admin A", passwordHash: pw, role: "ADMIN", roleId: adminRoleA.id, organizationId: orgA.id } });
  viewerA = await prisma.user.create({ data: { email: "viewera2@test.com", name: "Viewer A", passwordHash: pw, role: "VIEWER", roleId: viewerRoleA.id, organizationId: orgA.id } });

  // Org B
  orgB = await prisma.organization.create({ data: { name: "Beta Corp FW", slug: "beta-fw-test", onboardingComplete: true } });
  const adminRoleB = await prisma.role.create({
    data: { organizationId: orgB.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true },
  });
  adminB = await prisma.user.create({ data: { email: "adminb2@test.com", name: "Admin B", passwordHash: pw, role: "ADMIN", roleId: adminRoleB.id, organizationId: orgB.id } });

  // Create frameworks
  const soc2 = await prisma.framework.create({
    data: { organizationId: orgA.id, name: "SOC 2", version: "2017", description: "Service Organization Control 2", publisher: "AICPA" },
  });
  soc2Id = soc2.id;

  const iso = await prisma.framework.create({
    data: { organizationId: orgA.id, name: "ISO 27001:2022", version: "2022", description: "Information security management", publisher: "ISO" },
  });
  iso27001Id = iso.id;

  // Create requirements
  const cc61 = await prisma.frameworkRequirement.create({ data: { frameworkId: soc2Id, code: "CC6.1", title: "Logical and physical access controls", description: "The entity implements logical access security software, infrastructure, and architectures over protected information assets.", sortOrder: 1 } });
  cc61Id = cc61.id;
  const cc62 = await prisma.frameworkRequirement.create({ data: { frameworkId: soc2Id, code: "CC6.2", title: "Access credentials", description: "Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.", sortOrder: 2 } });
  cc62Id = cc62.id;
  const cc72 = await prisma.frameworkRequirement.create({ data: { frameworkId: soc2Id, code: "CC7.2", title: "Monitoring", description: "The entity monitors system components and the operation of those components for anomalies.", sortOrder: 3 } });
  cc72Id = cc72.id;

  const a515 = await prisma.frameworkRequirement.create({ data: { frameworkId: iso27001Id, code: "A.5.15", title: "Access control", description: "Rules to control physical and logical access to information and other associated assets.", sortOrder: 1 } });
  a515Id = a515.id;
  const a516 = await prisma.frameworkRequirement.create({ data: { frameworkId: iso27001Id, code: "A.5.16", title: "Identity management", description: "The full lifecycle of identities shall be managed.", sortOrder: 2 } });
  a516Id = a516.id;
  const a816 = await prisma.frameworkRequirement.create({ data: { frameworkId: iso27001Id, code: "A.8.16", title: "Monitoring activities", description: "Networks, systems and applications shall be monitored for anomalous behaviour.", sortOrder: 3 } });
  a816Id = a816.id;

  // Org B frameworks
  const soc2B = await prisma.framework.create({
    data: { organizationId: orgB.id, name: "SOC 2", version: "2017", description: "SOC 2 for Beta Corp", publisher: "AICPA" },
  });
  soc2BId = soc2B.id;
  const cc61B = await prisma.frameworkRequirement.create({ data: { frameworkId: soc2BId, code: "CC6.1", title: "Logical and physical access controls", sortOrder: 1 } });
  cc61BId = cc61B.id;

  // Create controls
  const c1 = await prisma.control.create({ data: { organizationId: orgA.id, code: "CTRL-001", title: "Quarterly review of production user access", description: "Production user access is reviewed quarterly by the system owner." } });
  ctrl001Id = c1.id;
  const c2 = await prisma.control.create({ data: { organizationId: orgA.id, code: "CTRL-002", title: "User provisioning and deprovisioning is performed through an approved process" } });
  ctrl002Id = c2.id;
  const c3 = await prisma.control.create({ data: { organizationId: orgA.id, code: "CTRL-003", title: "Security events are monitored and reviewed" } });
  ctrl003Id = c3.id;

  // Org B control for cross-tenant tests
  await prisma.control.create({ data: { organizationId: orgB.id, code: "CTRL-B01", title: "Beta Corp Control" } });

  console.log("  Data created. Logging in...\n");
  cookieAdminA = await login("admina2@test.com");
  cookieViewerA = await login("viewera2@test.com");
  cookieAdminB = await login("adminb2@test.com");
  console.log("  Sessions established.\n");
}

// ═══════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════

async function tc26() {
  console.log("\n── TC-26: View Framework ──");
  const { status, data } = await api("GET", "/api/frameworks", cookieAdminA);
  assert(status === 200, `GET frameworks succeeds (${status})`);
  const soc2 = data.find((f: any) => f.name === "SOC 2");
  assert(!!soc2, "SOC 2 found");
  assert(soc2.totalRequirements === 3, `SOC 2 has 3 requirements (got ${soc2.totalRequirements})`);
  assert(soc2.version === "2017", `Version is 2017`);
  assert(soc2.unmappedRequirements === 3, "All 3 unmapped initially");
}

async function tc27() {
  console.log("\n── TC-27: View Framework Requirements ──");
  const { status, data } = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  assert(status === 200, `GET framework detail succeeds (${status})`);
  assert(data.requirements.length === 3, `3 requirements returned`);
  const cc61 = data.requirements.find((r: any) => r.code === "CC6.1");
  assert(!!cc61, "CC6.1 found");
  assert(!!cc61.title, "CC6.1 has title");
  assert(!!cc61.description, "CC6.1 has description");
  assert(cc61.readiness === "UNMAPPED", `CC6.1 readiness is UNMAPPED (got ${cc61.readiness})`);
  assert(cc61.controlCount === 0, "CC6.1 has 0 mapped controls");
}

async function tc28() {
  console.log("\n── TC-28: Map one Control to one Requirement ──");
  const { status, data } = await api("POST", "/api/mappings", cookieAdminA, {
    controlId: ctrl001Id,
    frameworkRequirementId: cc61Id,
  });
  assert(status === 201, `Mapping created (${status})`);
  mapping_cc61_ctrl001 = data.id;

  // Verify from framework side
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.controlCount === 1, "CC6.1 now has 1 mapped control");

  // Verify from control side
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const m = ctrl.data.mappings.find((m: any) => m.requirement.code === "CC6.1");
  assert(!!m, "CTRL-001 shows CC6.1 mapping");
}

async function tc29() {
  console.log("\n── TC-29: Map one Control to multiple Requirements (CRITICAL) ──");
  // Already mapped to CC6.1, now add CC6.2 and A.5.15
  const r1 = await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl001Id, frameworkRequirementId: cc62Id });
  assert(r1.status === 201, "Mapped CTRL-001 → CC6.2");
  mapping_cc62_ctrl001 = r1.data.id;

  const r2 = await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl001Id, frameworkRequirementId: a515Id });
  assert(r2.status === 201, "Mapped CTRL-001 → A.5.15");
  mapping_a515_ctrl001 = r2.data.id;

  // Verify from control side — should show both frameworks
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const mappings = ctrl.data.mappings;
  assert(mappings.length === 3, `CTRL-001 has 3 mappings (got ${mappings.length})`);

  const fwNames = [...new Set(mappings.map((m: any) => m.requirement.framework.name))];
  assert(fwNames.includes("SOC 2"), "Mapped to SOC 2");
  assert(fwNames.includes("ISO 27001:2022"), "Mapped to ISO 27001:2022");

  const soc2Codes = mappings.filter((m: any) => m.requirement.framework.name === "SOC 2").map((m: any) => m.requirement.code).sort();
  assert(soc2Codes[0] === "CC6.1" && soc2Codes[1] === "CC6.2", `SOC 2 mappings: CC6.1, CC6.2 (got ${soc2Codes})`);
}

async function tc30() {
  console.log("\n── TC-30: One Requirement → Multiple Controls ──");
  const r = await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl002Id, frameworkRequirementId: cc61Id });
  assert(r.status === 201, "Mapped CTRL-002 → CC6.1");
  mapping_cc61_ctrl002 = r.data.id;

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.controlCount === 2, `CC6.1 now has 2 controls mapped (got ${cc61.controlCount})`);
}

async function tc31() {
  console.log("\n── TC-31: Duplicate Mapping ──");
  const r = await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl001Id, frameworkRequirementId: cc61Id });
  assert(r.status === 409, `Duplicate mapping rejected (${r.status})`);
  assert(r.data?.error?.includes("already mapped"), `Error: "${r.data?.error}"`);
}

async function tc32() {
  console.log("\n── TC-32: Remove Mapping ──");
  const r = await api("DELETE", `/api/mappings/${mapping_cc62_ctrl001}`, cookieAdminA);
  assert(r.status === 200, `Mapping removed (${r.status})`);

  // CC6.2 should now be unmapped
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc62 = fw.data.requirements.find((r: any) => r.code === "CC6.2");
  assert(cc62.controlCount === 0, "CC6.2 now has 0 controls (unmapped)");
  assert(cc62.readiness === "UNMAPPED", `CC6.2 readiness is UNMAPPED (got ${cc62.readiness})`);

  // CTRL-001 should no longer show CC6.2
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const hasCc62 = ctrl.data.mappings.some((m: any) => m.requirement.code === "CC6.2");
  assert(!hasCc62, "CTRL-001 no longer shows CC6.2");

  // Check audit
  const audit = await api("GET", "/api/audit-logs?entityType=ControlMapping", cookieAdminA);
  const delEntry = audit.data?.find((e: any) => e.action === "DELETE" && e.entityType === "ControlMapping");
  assert(!!delEntry, "Audit log records mapping removal");
}

async function tc33() {
  console.log("\n── TC-33: Unmapped Requirement ──");
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc72 = fw.data.requirements.find((r: any) => r.code === "CC7.2");
  assert(cc72.controlCount === 0, "CC7.2 has no controls");
  assert(cc72.readiness === "UNMAPPED", `CC7.2 readiness is UNMAPPED (got ${cc72.readiness})`);

  // Framework level stats
  assert(fw.data.unmappedRequirements !== undefined || fw.data.mappedRequirements !== undefined, "Framework has mapping stats");
  const cc62 = fw.data.requirements.find((r: any) => r.code === "CC6.2");
  assert(cc62.readiness === "UNMAPPED", "CC6.2 also unmapped after removal");
}

async function tc34() {
  console.log("\n── TC-34: Mapping ≠ Compliant (CRITICAL) ──");
  // CTRL-001 is mapped to CC6.1 but status is NOT_STARTED, no evidence, no tests
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "COMPLIANT", `CC6.1 is NOT compliant (readiness: ${cc61.readiness})`);
  assert(cc61.readiness === "MAPPED_NOT_IMPLEMENTED", `Readiness is MAPPED_NOT_IMPLEMENTED (got ${cc61.readiness})`);
}

async function tc35() {
  console.log("\n── TC-35: Implemented Control affects readiness ──");
  await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, { status: "IMPLEMENTED" });
  await api("PATCH", `/api/controls/${ctrl002Id}`, cookieAdminA, { status: "IMPLEMENTED" });

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "COMPLIANT", `Not fully compliant without evidence (${cc61.readiness})`);
  assert(cc61.readiness === "IMPLEMENTED_NO_EVIDENCE", `Readiness shows no evidence (got ${cc61.readiness})`);
}

async function tc36() {
  console.log("\n── TC-36: Evidence affects readiness ──");
  // Add evidence to CTRL-001 via DB
  await prisma.evidence.create({
    data: {
      controlId: ctrl001Id,
      type: "DOCUMENT",
      source: "MANUAL_UPLOAD",
      status: "VALID",
      uploadedById: adminA.id,
      fileName: "access-review.pdf",
      fileUrl: "/uploads/access-review.pdf",
      fileSize: 2048,
      storageKey: "test-evidence-key",
    },
  });

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "IMPLEMENTED_NO_EVIDENCE", `Readiness improved beyond no-evidence (${cc61.readiness})`);
  assert(cc61.readiness === "NOT_TESTED", `Readiness is NOT_TESTED (got ${cc61.readiness})`);
}

async function tc37() {
  console.log("\n── TC-37: Testing affects readiness (PASS) ──");
  // Record a passing test for CTRL-001
  const { status } = await api("POST", `/api/controls/${ctrl001Id}/tests`, cookieAdminA, {
    result: "PASS",
    testDate: new Date().toISOString(),
    notes: "Quarterly access review completed successfully",
  });
  assert(status === 201, `Test recorded (${status})`);

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness === "COMPLIANT", `CC6.1 is now COMPLIANT (got ${cc61.readiness})`);
}

async function tc38() {
  console.log("\n── TC-38: Failed Test ──");
  await api("POST", `/api/controls/${ctrl001Id}/tests`, cookieAdminA, {
    result: "FAIL",
    testDate: new Date().toISOString(),
    notes: "Access review found unauthorized accounts",
  });

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "COMPLIANT", `CC6.1 is NOT compliant after failed test`);
  assert(cc61.readiness === "FAILING_TEST", `Readiness is FAILING_TEST (got ${cc61.readiness})`);
}

async function tc39() {
  console.log("\n── TC-39: Finding affects requirement ──");
  // Fix the test back to PASS first
  await api("POST", `/api/controls/${ctrl001Id}/tests`, cookieAdminA, {
    result: "PASS", testDate: new Date().toISOString(), notes: "Re-tested",
  });

  // Create a finding against CTRL-001
  const { status, data } = await api("POST", "/api/findings", cookieAdminA, {
    controlId: ctrl001Id,
    title: "Unauthorized access found",
    description: "Two accounts had excessive privileges",
    severity: "HIGH",
  });
  assert(status === 201, `Finding created (${status})`);

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness === "OPEN_FINDING", `Readiness reflects open finding (got ${cc61.readiness})`);

  // Clean up finding
  await api("DELETE", `/api/findings/${data.id}`, cookieAdminA);
}

async function tc40() {
  console.log("\n── TC-40: Approved Exception ──");
  const { status, data } = await api("POST", "/api/exceptions", cookieAdminA, {
    controlId: ctrl001Id,
    reason: "Temporary exception for migration period",
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 86400000).toISOString(),
  });
  assert(status === 201, `Exception created (${status})`);

  // Approve it
  await api("PATCH", `/api/exceptions/${data.id}`, cookieAdminA, { status: "APPROVED" });

  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.hasException === true, "Framework view shows exception exists");
  // Exception should not make it appear as fully compliant without question
  // (it's COMPLIANT because test passed + evidence exists, but hasException flag is visible)

  // Clean up
  await api("PATCH", `/api/exceptions/${data.id}`, cookieAdminA, { status: "CLOSED" });
}

async function tc41() {
  console.log("\n── TC-41: Cross-tenant Framework Access ──");
  // Admin B cannot see Org A's framework
  const r1 = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminB);
  assert(r1.status === 404, `Admin B cannot access Org A's framework (${r1.status})`);

  // Admin A cannot see Org B's framework
  const r2 = await api("GET", `/api/frameworks/${soc2BId}`, cookieAdminA);
  assert(r2.status === 404, `Admin A cannot access Org B's framework (${r2.status})`);
}

async function tc42() {
  console.log("\n── TC-42: Cross-tenant Mapping Attack (CRITICAL) ──");
  // Org A control → Org B requirement
  const r1 = await api("POST", "/api/mappings", cookieAdminA, {
    controlId: ctrl001Id,
    frameworkRequirementId: cc61BId,
  });
  assert(r1.status === 404, `Org A ctrl → Org B req rejected (${r1.status})`);

  // Org B control → Org A requirement (via Org B session)
  const orgBCtrls = await prisma.control.findFirst({ where: { organizationId: orgB.id }, select: { id: true } });
  if (orgBCtrls) {
    const r2 = await api("POST", "/api/mappings", cookieAdminB, {
      controlId: orgBCtrls.id,
      frameworkRequirementId: cc61Id,
    });
    assert(r2.status === 404, `Org B ctrl → Org A req rejected (${r2.status})`);
  }

  // Org A trying to use Org B's control
  if (orgBCtrls) {
    const r3 = await api("POST", "/api/mappings", cookieAdminA, {
      controlId: orgBCtrls.id,
      frameworkRequirementId: cc61Id,
    });
    assert(r3.status === 404, `Org A using Org B's control rejected (${r3.status})`);
  }
}

async function tc43() {
  console.log("\n── TC-43: Viewer Mapping ──");
  const r = await api("POST", "/api/mappings", cookieViewerA, {
    controlId: ctrl003Id,
    frameworkRequirementId: cc72Id,
  });
  assert(r.status === 403, `Viewer cannot create mapping (${r.status})`);
}

async function tc44() {
  console.log("\n── TC-44: Mapping Audit ──");
  // Create a mapping
  const r1 = await api("POST", "/api/mappings", cookieAdminA, {
    controlId: ctrl003Id, frameworkRequirementId: cc72Id,
  });
  assert(r1.status === 201, "Mapping created for audit test");

  // Remove it
  const r2 = await api("DELETE", `/api/mappings/${r1.data.id}`, cookieAdminA);
  assert(r2.status === 200, "Mapping removed for audit test");

  // Create another
  const r3 = await api("POST", "/api/mappings", cookieAdminA, {
    controlId: ctrl003Id, frameworkRequirementId: cc72Id,
  });
  assert(r3.status === 201, "Mapping re-created for audit test");

  const audit = await api("GET", "/api/audit-logs?entityType=ControlMapping", cookieAdminA);
  const logs: any[] = audit.data ?? [];
  const creates = logs.filter((l) => l.action === "CREATE");
  const deletes = logs.filter((l) => l.action === "DELETE");
  assert(creates.length >= 2, `At least 2 CREATE mapping audit entries (got ${creates.length})`);
  assert(deletes.length >= 1, `At least 1 DELETE mapping audit entry (got ${deletes.length})`);

  for (const l of logs.slice(0, 3)) {
    assert(!!l.userName, `Audit entry has userName`);
    assert(!!l.createdAt, `Audit entry has timestamp`);
    assert(!!l.entityName, `Audit entry has entityName (control → requirement)`);
  }
}

async function tc45() {
  console.log("\n── TC-45: Framework Version Isolation ──");
  // We have SOC 2 version "2017". The version is part of the identity.
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  assert(fw.data.version === "2017", `SOC 2 version is tracked (${fw.data.version})`);

  const iso = await api("GET", `/api/frameworks/${iso27001Id}`, cookieAdminA);
  assert(iso.data.version === "2022", `ISO version is tracked (${iso.data.version})`);

  // Versions are separate entities — different frameworks entirely, not a concern about cross-contamination
  assert(fw.data.id !== iso.data.id, "Different frameworks have different IDs");
  console.log("  (Multi-version of same framework is future work — each version is a separate Framework entity)");
}

async function tc46() {
  console.log("\n── TC-46: Framework Requirement Cannot Be Edited by Customer ──");
  // No API for editing requirements — they're catalog data set during onboarding/seed
  // Try to find any PATCH/PUT endpoint for requirements
  const r1 = await api("PATCH", `/api/frameworks/${soc2Id}`, cookieAdminA, { name: "Hacked SOC 2" });
  // Since we only have GET, PATCH should return 405 or be undefined
  assert(r1.status === 405 || r1.status === 404 || r1.status === 500, `No PATCH endpoint for frameworks (${r1.status})`);
  console.log("  Requirements are catalog/reference data with no customer edit API");
}

async function tc47() {
  console.log("\n── TC-47: Framework Mapping Report ──");
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const reqs = fw.data.requirements;

  for (const req of reqs) {
    assert(req.code !== undefined, `Requirement ${req.code} has code`);
    assert(req.controlCount !== undefined, `Requirement ${req.code} has control count`);
    assert(req.readiness !== undefined, `Requirement ${req.code} has readiness`);
    assert(req.mappedControls !== undefined, `Requirement ${req.code} has mapped controls list`);

    if (req.controlCount > 0) {
      for (const c of req.mappedControls) {
        assert(!!c.code, `Mapped control has code`);
        assert(!!c.status, `Mapped control has status`);
        assert(c.evidenceCount !== undefined, `Mapped control has evidence count`);
        assert(c.lastTestResult !== undefined, `Mapped control has test result`);
      }
    }
  }

  // Overall framework stats
  assert(fw.data.totalRequirements === 3, `Total requirements: 3`);
  assert(fw.data.mappedRequirements !== undefined, `mappedRequirements stat exists`);
  assert(fw.data.compliantRequirements !== undefined, `compliantRequirements stat exists`);
}

async function tc48() {
  console.log("\n── TC-48: Control Coverage Report ──");
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const mappings = ctrl.data.mappings;

  // Group by framework
  const byFw: Record<string, string[]> = {};
  for (const m of mappings) {
    const fw = m.requirement.framework.name;
    if (!byFw[fw]) byFw[fw] = [];
    byFw[fw].push(m.requirement.code);
  }

  assert(Object.keys(byFw).length >= 2, `CTRL-001 maps to >= 2 frameworks (got ${Object.keys(byFw).length})`);
  assert(!!byFw["SOC 2"], "Mapped to SOC 2");
  assert(!!byFw["ISO 27001:2022"], "Mapped to ISO 27001:2022");
  assert(byFw["SOC 2"].includes("CC6.1"), "SOC 2 includes CC6.1");
  assert(byFw["ISO 27001:2022"].includes("A.5.15"), "ISO includes A.5.15");
}

async function tc49() {
  console.log("\n── TC-49: Delete Control with Mappings ──");
  // CTRL-001 has mappings — delete should be blocked
  const r = await api("DELETE", `/api/controls/${ctrl001Id}`, cookieAdminA);
  assert(r.status === 409, `Delete blocked by mappings (${r.status})`);
  assert(r.data?.error?.includes("mapping"), `Error mentions mappings: "${r.data?.error}"`);
}

async function tc50() {
  console.log("\n── TC-50: Delete Framework/Requirement with Mappings ──");
  // Requirements have cascade delete from framework, and mappings cascade from requirement
  // This is by design — but we should verify no orphaned mappings exist after
  // We won't actually delete the framework since we need it, but we verify the schema
  // has onDelete: Cascade for ControlMapping from FrameworkRequirement

  // Create a temp requirement, map it, then delete the requirement
  const tempReq = await prisma.frameworkRequirement.create({
    data: { frameworkId: soc2Id, code: "CC99.1", title: "Temp requirement", sortOrder: 99 },
  });
  await api("POST", "/api/mappings", cookieAdminA, {
    controlId: ctrl003Id, frameworkRequirementId: tempReq.id,
  });

  // Delete the requirement — cascades should clean up mappings
  await prisma.frameworkRequirement.delete({ where: { id: tempReq.id } });

  // Verify no orphaned mapping
  const orphans = await prisma.controlMapping.findMany({
    where: { frameworkRequirementId: tempReq.id },
  });
  assert(orphans.length === 0, "No orphaned mappings after requirement deletion");
}

async function tc51() {
  console.log("\n── TC-51: Mapping Does Not Duplicate Controls (CRITICAL) ──");
  // CTRL-001 is mapped to SOC 2 CC6.1 and ISO 27001 A.5.15
  // There should be exactly ONE CTRL-001 in the controls list
  const ctrls = await api("GET", "/api/controls", cookieAdminA);
  const ctrl001s = ctrls.data.filter((c: any) => c.code === "CTRL-001");
  assert(ctrl001s.length === 1, `Only ONE CTRL-001 exists (got ${ctrl001s.length})`);
  assert(ctrl001s[0].id === ctrl001Id, "Same control ID regardless of mappings");
}

async function tc52() {
  console.log("\n── TC-52: Reverse Mapping (bidirectional navigation) ──");
  // From framework → requirement → control
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  const mappedCtrl = cc61.mappedControls.find((c: any) => c.code === "CTRL-001");
  assert(!!mappedCtrl, "Framework → Requirement → Control: CTRL-001 found under CC6.1");
  assert(mappedCtrl.controlId === ctrl001Id, "Correct control ID");

  // From control → framework requirement
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const fwMapping = ctrl.data.mappings.find((m: any) => m.requirement.code === "CC6.1");
  assert(!!fwMapping, "Control → Framework Requirement: CC6.1 found");
  assert(fwMapping.requirement.framework.name === "SOC 2", "Correct framework name");
}

async function tc53() {
  console.log("\n── TC-53: Mapping Doesn't Change Control ──");
  // Capture control state before mapping
  const before = await api("GET", `/api/controls/${ctrl002Id}`, cookieAdminA);
  const snapshot = {
    title: before.data.title,
    description: before.data.description,
    status: before.data.status,
    frequency: before.data.frequency,
    applicability: before.data.applicability,
    ownerId: before.data.ownerId,
  };

  // Add more mappings to CTRL-002
  await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl002Id, frameworkRequirementId: cc62Id });
  await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl002Id, frameworkRequirementId: a516Id });

  // Check control is unchanged
  const after = await api("GET", `/api/controls/${ctrl002Id}`, cookieAdminA);
  assert(after.data.title === snapshot.title, "Title unchanged");
  assert(after.data.description === snapshot.description, "Description unchanged");
  assert(after.data.status === snapshot.status, "Status unchanged");
  assert(after.data.frequency === snapshot.frequency, "Frequency unchanged");
  assert(after.data.applicability === snapshot.applicability, "Applicability unchanged");
  assert(after.data.ownerId === snapshot.ownerId, "Owner unchanged");
}

async function tc54() {
  console.log("\n── TC-54: Mapping Doesn't Change Framework Requirement ──");
  // Capture requirement state before mapping
  const fwBefore = await api("GET", `/api/frameworks/${iso27001Id}`, cookieAdminA);
  const a816Before = fwBefore.data.requirements.find((r: any) => r.code === "A.8.16");
  const snapshot = { code: a816Before.code, title: a816Before.title, description: a816Before.description };

  // Map a control to it
  await api("POST", "/api/mappings", cookieAdminA, { controlId: ctrl003Id, frameworkRequirementId: a816Id });

  // Check requirement is unchanged
  const fwAfter = await api("GET", `/api/frameworks/${iso27001Id}`, cookieAdminA);
  const a816After = fwAfter.data.requirements.find((r: any) => r.code === "A.8.16");
  assert(a816After.code === snapshot.code, "Requirement code unchanged");
  assert(a816After.title === snapshot.title, "Requirement title unchanged");
  assert(a816After.description === snapshot.description, "Requirement description unchanged");
}

// ═══════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════

async function cleanup() {
  console.log("\n═══ CLEANUP ═══\n");
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean) as string[];
  if (orgIds.length > 0) {
    await prisma.controlMapping.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.controlTest.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.finding.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.controlException.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.evidence.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.frameworkRequirement.deleteMany({ where: { framework: { organizationId: { in: orgIds } } } });
    await prisma.framework.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
  console.log("  Test data cleaned up.\n");
}

async function main() {
  try {
    await setup();

    await tc26();
    await tc27();
    await tc28();
    await tc29();
    await tc30();
    await tc31();
    await tc32();
    await tc33();
    await tc34();
    await tc35();
    await tc36();
    await tc37();
    await tc38();
    await tc39();
    await tc40();
    await tc41();
    await tc42();
    await tc43();
    await tc44();
    await tc45();
    await tc46();
    await tc47();
    await tc48();
    await tc49();
    await tc50();
    await tc51();
    await tc52();
    await tc53();
    await tc54();

    console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══\n`);
  } catch (err) {
    console.error("Test suite error:", err);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
