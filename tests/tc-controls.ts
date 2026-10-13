/**
 * Control module test cases TC-01 through TC-25
 * Run: npx tsx tests/tc-controls.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const BASE = "http://localhost:3002";

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

const PASSWORD = "TestPass123!";

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
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { cookie: "" },
  });
  const csrfData = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];

  const cookieHeader = csrfCookies
    .map((c: string) => c.split(";")[0])
    .join("; ");

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader,
    },
    body: new URLSearchParams({
      email,
      password: PASSWORD,
      csrfToken: csrfData.csrfToken,
      callbackUrl: BASE,
      json: "true",
    }),
    redirect: "manual",
  });

  const allCookies = res.headers.getSetCookie?.() ?? [];
  const sessionCookie = allCookies
    .filter((c: string) => c.includes("next-auth.session-token"))
    .map((c: string) => c.split(";")[0])
    .join("; ");

  if (!sessionCookie) {
    throw new Error(`Login failed for ${email}: no session cookie`);
  }
  return sessionCookie;
}

async function api(
  method: string,
  path: string,
  cookie: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

// ────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────
async function setup() {
  console.log("\n═══ SETUP: Creating test organizations and users ═══\n");

  const pw = await hash(PASSWORD, 10);

  // Clean up any prior test data
  await prisma.user.deleteMany({
    where: { email: { in: ["admina@test.com", "editora@test.com", "viewera@test.com", "adminb@test.com"] } },
  });
  await prisma.organization.deleteMany({
    where: { name: { in: ["Acme Corp", "Beta Corp"] } },
  });

  // Create Org A
  orgA = await prisma.organization.create({
    data: { name: "Acme Corp", slug: "acme-corp-test", onboardingComplete: true },
  });

  // Create built-in roles for Org A
  const { BUILT_IN_ROLES } = await import("../src/lib/permissions");
  const adminRole = await prisma.role.create({
    data: {
      organizationId: orgA.id,
      name: "Admin",
      description: "Full access",
      permissions: BUILT_IN_ROLES.find((r) => r.name === "Admin")!.permissions,
      isBuiltIn: true,
    },
  });
  const editorRole = await prisma.role.create({
    data: {
      organizationId: orgA.id,
      name: "Editor",
      description: "Edit access",
      permissions: BUILT_IN_ROLES.find((r) => r.name === "Editor")!.permissions,
      isBuiltIn: true,
    },
  });
  const viewerRole = await prisma.role.create({
    data: {
      organizationId: orgA.id,
      name: "Viewer",
      description: "Read-only",
      permissions: BUILT_IN_ROLES.find((r) => r.name === "Viewer")!.permissions,
      isBuiltIn: true,
    },
  });

  adminA = await prisma.user.create({
    data: {
      email: "admina@test.com",
      name: "Admin A",
      passwordHash: pw,
      role: "ADMIN",
      roleId: adminRole.id,
      organizationId: orgA.id,
    },
  });
  editorA = await prisma.user.create({
    data: {
      email: "editora@test.com",
      name: "Editor A",
      passwordHash: pw,
      role: "EDITOR",
      roleId: editorRole.id,
      organizationId: orgA.id,
    },
  });
  viewerA = await prisma.user.create({
    data: {
      email: "viewera@test.com",
      name: "Viewer A",
      passwordHash: pw,
      role: "VIEWER",
      roleId: viewerRole.id,
      organizationId: orgA.id,
    },
  });

  // Create Org B
  orgB = await prisma.organization.create({
    data: { name: "Beta Corp", slug: "beta-corp-test", onboardingComplete: true },
  });
  const adminRoleB = await prisma.role.create({
    data: {
      organizationId: orgB.id,
      name: "Admin",
      description: "Full access",
      permissions: BUILT_IN_ROLES.find((r) => r.name === "Admin")!.permissions,
      isBuiltIn: true,
    },
  });
  adminB = await prisma.user.create({
    data: {
      email: "adminb@test.com",
      name: "Admin B",
      passwordHash: pw,
      role: "ADMIN",
      roleId: adminRoleB.id,
      organizationId: orgB.id,
    },
  });

  console.log("  Orgs and users created. Logging in...\n");

  cookieAdminA = await login("admina@test.com");
  cookieEditorA = await login("editora@test.com");
  cookieViewerA = await login("viewera@test.com");
  cookieAdminB = await login("adminb@test.com");

  console.log("  All 4 sessions established.\n");
}

// ────────────────────────────────────────────────────
// Test Cases
// ────────────────────────────────────────────────────

async function tc01() {
  console.log("\n── TC-01: Create a valid control (CTRL-001) ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-001",
    title: "Quarterly Access Review",
    description: "Production user access is reviewed quarterly by the system owner.",
    ownerId: adminA.id,
    frequency: "QUARTERLY",
    applicability: "APPLICABLE",
    status: "IN_PROGRESS",
  });
  assert(status === 201, `Status is 201 (got ${status})`);
  assert(data.code === "CTRL-001", "Code is CTRL-001");
  assert(data.title === "Quarterly Access Review", "Title matches");
  assert(data.status === "IN_PROGRESS", "Status is IN_PROGRESS");
  assert(data.frequency === "QUARTERLY", "Frequency is QUARTERLY");
  assert(data.applicability === "APPLICABLE", "Applicability is APPLICABLE");
  assert(data.ownerId === adminA.id, "Owner is Admin A");
  ctrl001Id = data.id;
}

async function tc02() {
  console.log("\n── TC-02: Create another control (CTRL-002) ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-002",
    title: "Backup Monitoring",
    description: "Monitoring of backup procedures.",
  });
  assert(status === 201, `Status is 201 (got ${status})`);
  assert(data.code === "CTRL-002", "Code is CTRL-002");
  ctrl002Id = data.id;
}

async function tc03() {
  console.log("\n── TC-03: Duplicate control code in same org ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-001",
    title: "Another Access Control",
  });
  assert(status === 409, `Status is 409 conflict (got ${status})`);
  assert(data?.error?.includes("already exists"), `Error mentions already exists: "${data?.error}"`);
}

async function tc04() {
  console.log("\n── TC-04: Same code in different org ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminB, {
    code: "CTRL-001",
    title: "Quarterly Access Review",
  });
  assert(status === 201, `Status is 201 (got ${status})`);
  assert(data.code === "CTRL-001", "Org B can have CTRL-001 too");
}

async function tc05() {
  console.log("\n── TC-05: Missing mandatory title ──");
  const { status } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-X",
    title: "",
  });
  assert(status === 400, `Validation error (got ${status})`);
}

async function tc06() {
  console.log("\n── TC-06: Missing description ──");
  // Description is optional with default ""
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-NODESC",
    title: "No Description Control",
  });
  assert(status === 201, `Description is optional, create succeeds (got ${status})`);
  assert(data.description === "", "Description defaults to empty string");
  // Clean up
  await api("DELETE", `/api/controls/${data.id}`, cookieAdminA);
}

async function tc07() {
  console.log("\n── TC-07: Invalid frequency ──");
  const { status } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-BAD",
    title: "Bad Freq",
    frequency: "EVERY 2 DAYS",
  });
  assert(status === 400, `Invalid frequency rejected (got ${status})`);
}

async function tc08() {
  console.log("\n── TC-08: Invalid applicability ──");
  const { status } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-BAD2",
    title: "Bad Appl",
    applicability: "INVALID_VALUE",
  });
  assert(status === 400, `Invalid applicability rejected (got ${status})`);
}

async function tc09() {
  console.log("\n── TC-09: Not Applicable without justification ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-NA1",
    title: "NA Test",
    applicability: "NOT_APPLICABLE",
    applicabilityJustification: "",
  });
  assert(status === 400, `Rejected without justification (got ${status})`);
}

async function tc10() {
  console.log("\n── TC-10: Not Applicable with justification ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-NA2",
    title: "NA With Justification",
    applicability: "NOT_APPLICABLE",
    applicabilityJustification:
      "This control is not applicable because the organization does not operate its own production infrastructure.",
  });
  assert(status === 201, `Created successfully (got ${status})`);
  assert(data.applicability === "NOT_APPLICABLE", "Applicability is NOT_APPLICABLE");
  assert(
    data.applicabilityJustification.includes("not applicable"),
    "Justification is retained"
  );
  // Clean up
  await api("DELETE", `/api/controls/${data.id}`, cookieAdminA);
}

async function tc11() {
  console.log("\n── TC-11: Change control owner ──");
  const { status, data } = await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, {
    ownerId: editorA.id,
  });
  assert(status === 200, `Owner changed (got ${status})`);
  assert(data.ownerId === editorA.id, "Owner is now Editor A");

  // Check audit log
  const audit = await api("GET", `/api/audit-logs?entityType=Control&entityId=${ctrl001Id}`, cookieAdminA);
  const updateEntry = audit.data?.find?.(
    (e: any) => e.action === "UPDATE" && e.changes?.ownerId
  );
  assert(!!updateEntry, "Audit log records owner change");
  assert(
    updateEntry?.changes?.ownerId?.from === adminA.id,
    "Before value is Admin A"
  );
  assert(
    updateEntry?.changes?.ownerId?.to === editorA.id,
    "After value is Editor A"
  );
}

async function tc12() {
  console.log("\n── TC-12: Change control status ──");
  const { status, data } = await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, {
    status: "IMPLEMENTED",
  });
  assert(status === 200, `Status changed (got ${status})`);
  assert(data.status === "IMPLEMENTED", "Status is now IMPLEMENTED");

  const audit = await api("GET", `/api/audit-logs?entityType=Control&entityId=${ctrl001Id}`, cookieAdminA);
  const updateEntry = audit.data?.find?.(
    (e: any) => e.action === "UPDATE" && e.changes?.status
  );
  assert(!!updateEntry, "Audit log records status change");
  assert(
    updateEntry?.changes?.status?.from === "IN_PROGRESS",
    "Before = IN_PROGRESS"
  );
  assert(
    updateEntry?.changes?.status?.to === "IMPLEMENTED",
    "After = IMPLEMENTED"
  );
}

async function tc13() {
  console.log("\n── TC-13: Edit control from another org ──");
  const { status } = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminB);
  assert(status === 404, `Admin B cannot see Org A's control (got ${status})`);
}

async function tc14() {
  console.log("\n── TC-14: Modify another org's control ──");
  const { status } = await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminB, {
    title: "Hacked Title",
  });
  assert(status === 404, `Admin B cannot modify Org A's control (got ${status})`);

  // Verify unchanged
  const { data } = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  assert(data.title === "Quarterly Access Review", "Title unchanged");
}

async function tc15() {
  console.log("\n── TC-15: Cross-tenant owner manipulation ──");
  const { status, data } = await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, {
    ownerId: adminB.id,
  });
  assert(status === 400, `Cross-tenant owner rejected (got ${status})`);
  assert(
    data?.error?.includes("does not belong"),
    `Error mentions org boundary: "${data?.error}"`
  );
}

async function tc16() {
  console.log("\n── TC-16: Viewer attempts to create control ──");
  const { status } = await api("POST", "/api/controls", cookieViewerA, {
    code: "CTRL-VIEWER",
    title: "Viewer Should Not Create",
  });
  assert(status === 403, `Viewer POST rejected with 403 (got ${status})`);
}

async function tc17() {
  console.log("\n── TC-17: Viewer attempts to edit control ──");
  const { status } = await api("PATCH", `/api/controls/${ctrl001Id}`, cookieViewerA, {
    title: "Viewer Edit Attempt",
  });
  assert(status === 403, `Viewer PATCH rejected with 403 (got ${status})`);
}

async function tc18() {
  console.log("\n── TC-18: Viewer attempts to delete control ──");
  const { status } = await api("DELETE", `/api/controls/${ctrl001Id}`, cookieViewerA);
  assert(status === 403, `Viewer DELETE rejected with 403 (got ${status})`);
}

async function tc19() {
  console.log("\n── TC-19: Delete control with dependencies ──");
  // Create a control with evidence dependency
  const { data: ctrl } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-DEP",
    title: "Control With Dependencies",
  });
  // Add evidence directly via DB to simulate dependency
  await prisma.evidence.create({ data: {
      organizationId: (await prisma.control.findUniqueOrThrow({ where: { id: ctrl.id } })).organizationId,
      controls: { create: { controlId: ctrl.id } },
      type: "DOCUMENT",
      source: "MANUAL_UPLOAD",
      status: "VALID",
      uploadedById: adminA.id,
      fileName: "test.pdf",
      fileUrl: "/uploads/test.pdf",
      fileSize: 1024,
      storageKey: "test-key",
    },
  });

  const { status, data } = await api("DELETE", `/api/controls/${ctrl.id}`, cookieAdminA);
  assert(status === 409, `Delete blocked by dependencies (got ${status})`);
  assert(data?.error?.includes("dependencies"), `Error mentions dependencies: "${data?.error}"`);

  // Clean up evidence then delete
  await prisma.evidence.deleteMany({ where: { controls: { some: { controlId: ctrl.id } } } });
  const { status: s2 } = await api("DELETE", `/api/controls/${ctrl.id}`, cookieAdminA);
  assert(s2 === 200, `Delete succeeds after removing dependencies (got ${s2})`);
}

async function tc20() {
  console.log("\n── TC-20: Audit trail for control lifecycle ──");
  // Create
  const { data: c } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-AUDIT",
    title: "Audit Trail Test",
    frequency: "MONTHLY",
  });
  // Edit title
  await api("PATCH", `/api/controls/${c.id}`, cookieAdminA, {
    title: "Audit Trail Test Updated",
  });
  // Change owner
  await api("PATCH", `/api/controls/${c.id}`, cookieAdminA, {
    ownerId: editorA.id,
  });
  // Change status
  await api("PATCH", `/api/controls/${c.id}`, cookieAdminA, {
    status: "IMPLEMENTED",
  });
  // Change frequency
  await api("PATCH", `/api/controls/${c.id}`, cookieAdminA, {
    frequency: "QUARTERLY",
  });
  // Delete
  await api("DELETE", `/api/controls/${c.id}`, cookieAdminA);

  const audit = await api(
    "GET",
    `/api/audit-logs?entityType=Control&entityId=${c.id}`,
    cookieAdminA
  );
  const logs: any[] = audit.data ?? [];
  assert(logs.some((l) => l.action === "CREATE"), "CREATE audit entry exists");
  assert(
    logs.filter((l) => l.action === "UPDATE").length >= 4,
    "At least 4 UPDATE entries (title, owner, status, frequency)"
  );
  assert(logs.some((l) => l.action === "DELETE"), "DELETE audit entry exists");

  // Check that entries have required fields
  for (const l of logs) {
    assert(!!l.userName, `Entry ${l.action} has userName`);
    assert(!!l.createdAt, `Entry ${l.action} has timestamp`);
    assert(!!l.entityType, `Entry ${l.action} has entityType`);
    assert(!!l.entityId, `Entry ${l.action} has entityId`);
  }

  // Check before/after on an UPDATE
  const statusChange = logs.find(
    (l) => l.action === "UPDATE" && l.changes?.status
  );
  assert(!!statusChange?.beforeJson, "UPDATE has beforeJson");
  assert(!!statusChange?.afterJson, "UPDATE has afterJson");
}

async function tc21() {
  console.log("\n── TC-21: API without authentication ──");
  const endpoints = [
    { method: "GET", path: "/api/controls" },
    { method: "POST", path: "/api/controls" },
    { method: "GET", path: `/api/controls/${ctrl001Id}` },
    { method: "PATCH", path: `/api/controls/${ctrl001Id}` },
    { method: "DELETE", path: `/api/controls/${ctrl001Id}` },
  ];
  for (const ep of endpoints) {
    const res = await fetch(`${BASE}${ep.path}`, {
      method: ep.method,
      headers: { "Content-Type": "application/json" },
      body: ep.method !== "GET" ? JSON.stringify({ title: "test" }) : undefined,
    });
    assert(
      res.status === 401,
      `${ep.method} ${ep.path} returns 401 (got ${res.status})`
    );
  }
}

async function tc22() {
  console.log("\n── TC-22: Manipulate organizationId ──");
  const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-ORG-HACK",
    title: "Org Manipulation Test",
    organizationId: orgB.id,
  });
  assert(status === 201, `Create succeeds (got ${status})`);
  assert(
    data.organizationId === orgA.id,
    `organizationId is forced to Admin A's org (${data.organizationId} === ${orgA.id})`
  );
  // Clean up
  await api("DELETE", `/api/controls/${data.id}`, cookieAdminA);
}

async function tc23() {
  console.log("\n── TC-23: SQL/injection-style input ──");
  const malicious = [
    "' OR 1=1 --",
    '<script>alert(1)</script>',
    "Robert'); DROP TABLE controls;--",
  ];
  for (const val of malicious) {
    const { status, data } = await api("POST", "/api/controls", cookieAdminA, {
      code: `INJ-${Date.now()}`,
      title: val,
      description: val,
    });
    assert(status === 201, `Injection input accepted safely (got ${status})`);
    assert(data.title === val, "Data stored as-is (no corruption)");
    // Clean up
    await api("DELETE", `/api/controls/${data.id}`, cookieAdminA);
  }
}

async function tc24() {
  console.log("\n── TC-24: Very long input ──");
  const longStr = "A".repeat(5000);
  const { status: s1, data: d1 } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-LONG",
    title: longStr,
  });
  assert(s1 === 400, `Long title rejected (got ${s1})`);

  const { status: s2 } = await api("POST", "/api/controls", cookieAdminA, {
    code: "CTRL-LONG2",
    title: "Valid Title",
    description: longStr,
  });
  assert(s2 === 400, `Long description rejected (got ${s2})`);
}

async function tc25() {
  console.log("\n── TC-25: Concurrent editing ──");
  // Both update at the same time
  const [r1, r2] = await Promise.all([
    api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, {
      status: "NOT_STARTED",
    }),
    api("PATCH", `/api/controls/${ctrl001Id}`, cookieEditorA, {
      ownerId: adminA.id,
    }),
  ]);
  assert(r1.status === 200, `Concurrent update 1 succeeds (got ${r1.status})`);
  assert(r2.status === 200, `Concurrent update 2 succeeds (got ${r2.status})`);

  // Verify final state is consistent
  const { data } = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  assert(
    data.status !== undefined && data.ownerId !== undefined,
    "Final state is consistent (no corruption)"
  );
  console.log(`  Final state: status=${data.status}, ownerId=${data.ownerId}`);
}

// ────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────
async function cleanup() {
  console.log("\n═══ CLEANUP ═══\n");
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean) as string[];
  if (orgIds.length > 0) {
    await prisma.evidence.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  } else {
    await prisma.user.deleteMany({
      where: { email: { in: ["admina@test.com", "editora@test.com", "viewera@test.com", "adminb@test.com"] } },
    });
    await prisma.organization.deleteMany({
      where: { slug: { in: ["acme-corp-test", "beta-corp-test"] } },
    });
  }
  console.log("  Test data cleaned up.\n");
}

// ────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────
async function main() {
  try {
    await setup();

    await tc01();
    await tc02();
    await tc03();
    await tc04();
    await tc05();
    await tc06();
    await tc07();
    await tc08();
    await tc09();
    await tc10();
    await tc11();
    await tc12();
    await tc13();
    await tc14();
    await tc15();
    await tc16();
    await tc17();
    await tc18();
    await tc19();
    await tc20();
    await tc21();
    await tc22();
    await tc23();
    await tc24();
    await tc25();

    console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══\n`);
  } catch (err) {
    console.error("Test suite error:", err);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
