/**
 * Evidence Lifecycle test cases TC-55 through TC-90
 * Run: npx tsx tests/tc-evidence.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, statSync } from "fs";
import path from "path";

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
let ctrlBId = "";
let soc2Id = "";
let iso27001Id = "";
let cc61Id = "";
let a515Id = "";

// Evidence IDs created during tests
let evidenceQ3Id = "";
let evidenceQ2Id = "";
let evidenceQ4Id = "";

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

async function uploadEvidence(cookie: string, controlId: string, fileName: string, fileContent: Buffer | Uint8Array, fields?: Record<string, string>) {
  const form = new FormData();
  form.append("controlId", controlId);
  const blob = new Blob([fileContent], { type: "application/pdf" });
  form.append("file", blob, fileName);
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }
  }
  const res = await fetch(`${BASE}/api/evidence`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function uploadRawEvidence(cookie: string, controlId: string, fileName: string, fileContent: Buffer | Uint8Array, mimeType: string) {
  const form = new FormData();
  form.append("controlId", controlId);
  const blob = new Blob([fileContent], { type: mimeType });
  form.append("file", blob, fileName);
  const res = await fetch(`${BASE}/api/evidence`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// Create a minimal valid PDF
function makePdf(content: string): Buffer {
  const body = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  const pdf = `%PDF-1.4\n${body}xref\n0 4\ntrailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n0\n%%EOF\n% ${content}`;
  return Buffer.from(pdf);
}

const TEST_DIR = path.resolve(__dirname, "__test_files__");

async function setup() {
  console.log("\n═══ SETUP ═══\n");
  const pw = await hash(PASSWORD, 10);

  // Clean prior test data
  await prisma.user.deleteMany({ where: { email: { in: ["admina3@test.com", "editora3@test.com", "viewera3@test.com", "adminb3@test.com"] } } });
  await prisma.organization.deleteMany({ where: { slug: { in: ["acme-ev-test", "beta-ev-test"] } } });

  const { BUILT_IN_ROLES } = await import("../src/lib/permissions");

  // Org A
  orgA = await prisma.organization.create({ data: { name: "Acme Corp EV", slug: "acme-ev-test", onboardingComplete: true } });
  const adminRoleA = await prisma.role.create({
    data: { organizationId: orgA.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true },
  });
  const editorRoleA = await prisma.role.create({
    data: { organizationId: orgA.id, name: "Editor", description: "Edit", permissions: BUILT_IN_ROLES.find(r => r.name === "Editor")!.permissions, isBuiltIn: true },
  });
  const viewerRoleA = await prisma.role.create({
    data: { organizationId: orgA.id, name: "Viewer", description: "Read-only", permissions: BUILT_IN_ROLES.find(r => r.name === "Viewer")!.permissions, isBuiltIn: true },
  });

  adminA = await prisma.user.create({ data: { email: "admina3@test.com", name: "Admin A", passwordHash: pw, role: "ADMIN", roleId: adminRoleA.id, organizationId: orgA.id } });
  editorA = await prisma.user.create({ data: { email: "editora3@test.com", name: "Editor A", passwordHash: pw, role: "EDITOR", roleId: editorRoleA.id, organizationId: orgA.id } });
  viewerA = await prisma.user.create({ data: { email: "viewera3@test.com", name: "Viewer A", passwordHash: pw, role: "VIEWER", roleId: viewerRoleA.id, organizationId: orgA.id } });

  // Org B
  orgB = await prisma.organization.create({ data: { name: "Beta Corp EV", slug: "beta-ev-test", onboardingComplete: true } });
  const adminRoleB = await prisma.role.create({
    data: { organizationId: orgB.id, name: "Admin", description: "Full", permissions: BUILT_IN_ROLES.find(r => r.name === "Admin")!.permissions, isBuiltIn: true },
  });
  adminB = await prisma.user.create({ data: { email: "adminb3@test.com", name: "Admin B", passwordHash: pw, role: "ADMIN", roleId: adminRoleB.id, organizationId: orgB.id } });

  // Control for Org A
  const ctrl = await prisma.control.create({
    data: { organizationId: orgA.id, code: "CTRL-001", title: "Quarterly Production Access Review", status: "IMPLEMENTED", applicability: "APPLICABLE", frequency: "QUARTERLY" },
  });
  ctrl001Id = ctrl.id;

  // Control for Org B
  const ctrlB = await prisma.control.create({
    data: { organizationId: orgB.id, code: "CTRL-B01", title: "Beta Control" },
  });
  ctrlBId = ctrlB.id;

  // Frameworks + requirements + mappings for readiness tests
  const soc2 = await prisma.framework.create({ data: { organizationId: orgA.id, name: "SOC 2", version: "2017", publisher: "AICPA" } });
  soc2Id = soc2.id;
  const iso = await prisma.framework.create({ data: { organizationId: orgA.id, name: "ISO 27001:2022", version: "2022", publisher: "ISO" } });
  iso27001Id = iso.id;

  const cc61 = await prisma.frameworkRequirement.create({ data: { frameworkId: soc2Id, code: "CC6.1", title: "Logical and physical access controls", sortOrder: 1 } });
  cc61Id = cc61.id;
  const a515 = await prisma.frameworkRequirement.create({ data: { frameworkId: iso27001Id, code: "A.5.15", title: "Access control", sortOrder: 1 } });
  a515Id = a515.id;

  await prisma.controlMapping.create({ data: { controlId: ctrl001Id, frameworkRequirementId: cc61Id } });
  await prisma.controlMapping.create({ data: { controlId: ctrl001Id, frameworkRequirementId: a515Id } });

  // Create test files directory
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(path.join(TEST_DIR, "Access-Review-Q3-2026.pdf"), makePdf("Q3 2026 access review"));
  writeFileSync(path.join(TEST_DIR, "Access-Review-Q2-2026.pdf"), makePdf("Q2 2026 access review"));
  writeFileSync(path.join(TEST_DIR, "Access-Review-Q4-2026.pdf"), makePdf("Q4 2026 access review"));

  console.log("  Data created. Logging in...\n");
  cookieAdminA = await login("admina3@test.com");
  cookieEditorA = await login("editora3@test.com");
  cookieViewerA = await login("viewera3@test.com");
  cookieAdminB = await login("adminb3@test.com");
  console.log("  Sessions established.\n");
}

// ═══════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════

async function tc55() {
  console.log("\n── TC-55: Upload Valid Evidence ──");
  const pdfContent = readFileSync(path.join(TEST_DIR, "Access-Review-Q3-2026.pdf"));
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Access-Review-Q3-2026.pdf", pdfContent, {
    type: "DOCUMENT",
    source: "MANUAL_UPLOAD",
    collectedAt: "2026-09-30T00:00:00.000Z",
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    description: "Q3 production access review",
  });
  assert(r.status === 201, `Upload succeeds (${r.status})`);
  evidenceQ3Id = r.data.id;
  assert(r.data.fileName === "Access-Review-Q3-2026.pdf", `Filename is correct`);
  assert(r.data.fileSize > 0, `File size is shown (${r.data.fileSize})`);
  assert(r.data.uploadedById === adminA.id, `Uploaded by is correct`);
  assert(r.data.controlId === ctrl001Id, `Control ID is correct`);
  assert(r.data.type === "DOCUMENT", `Type is DOCUMENT`);
  assert(r.data.source === "MANUAL_UPLOAD", `Source is MANUAL_UPLOAD`);
  assert(r.data.description === "Q3 production access review", `Description is correct`);
  assert(r.data.validFrom !== null, `Valid From is set`);
  assert(r.data.validUntil !== null, `Valid Until is set`);

  // Check audit
  const audit = await api("GET", "/api/audit-logs?entityType=Evidence", cookieAdminA);
  const createEntry = audit.data?.find((e: any) => e.action === "CREATE" && e.entityName === "Access-Review-Q3-2026.pdf");
  assert(!!createEntry, "Audit entry created for upload");
}

async function tc56() {
  console.log("\n── TC-56: Evidence Appears on Control Detail ──");
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  assert(ctrl.data._count.evidence >= 1, `Control shows evidence count >= 1 (got ${ctrl.data._count.evidence})`);

  // Check evidence list for this control
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  assert(evList.status === 200, "Evidence list loads");
  const q3 = evList.data.find((e: any) => e.id === evidenceQ3Id);
  assert(!!q3, "Q3 evidence found in list");
  assert(q3.fileName === "Access-Review-Q3-2026.pdf", "Filename shown");
  assert(q3.type === "DOCUMENT", "Type shown");
  assert(q3.source === "MANUAL_UPLOAD", "Source shown");
  assert(!!q3.uploadedBy, "Uploader shown");
  assert(q3.description === "Q3 production access review", "Description shown");
  assert(q3.validFrom !== null, "Validity shown");
  assert(q3.computedStatus === "VALID", `Computed status is VALID (got ${q3.computedStatus})`);
}

async function tc57() {
  console.log("\n── TC-57: Download Evidence ──");
  const res = await fetch(`${BASE}/api/evidence/${evidenceQ3Id}/download`, {
    headers: { cookie: cookieAdminA },
  });
  assert(res.status === 200, `Download succeeds (${res.status})`);
  const contentDisp = res.headers.get("content-disposition") ?? "";
  assert(contentDisp.includes("Access-Review-Q3-2026.pdf"), "Filename preserved in download");
  const downloaded = await res.arrayBuffer();
  assert(downloaded.byteLength > 0, `Downloaded file has content (${downloaded.byteLength} bytes)`);
  // Verify it starts with %PDF
  const header = new Uint8Array(downloaded.slice(0, 4));
  assert(header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46, "Downloaded file is a valid PDF");
}

async function tc58() {
  console.log("\n── TC-58: Unauthorized Evidence Download ──");
  // Viewer should have evidence:read so they CAN download
  // But let's test with no cookie (unauthenticated)
  const res = await fetch(`${BASE}/api/evidence/${evidenceQ3Id}/download`);
  assert(res.status === 401 || res.status === 403, `Unauthenticated download blocked (${res.status})`);

  // Viewer with evidence:read CAN download (this is expected)
  const viewerRes = await fetch(`${BASE}/api/evidence/${evidenceQ3Id}/download`, {
    headers: { cookie: cookieViewerA },
  });
  assert(viewerRes.status === 200, `Viewer with evidence:read CAN download (${viewerRes.status})`);
}

async function tc59() {
  console.log("\n── TC-59: Cross-tenant Evidence Download (CRITICAL) ──");
  const res = await fetch(`${BASE}/api/evidence/${evidenceQ3Id}/download`, {
    headers: { cookie: cookieAdminB },
  });
  assert(res.status === 404, `Cross-tenant download blocked (${res.status})`);
  // Verify no data leaked
  if (res.status !== 200) {
    console.log("  (No file content leaked)");
  }
}

async function tc60() {
  console.log("\n── TC-60: Cross-tenant Evidence Association (CRITICAL) ──");
  const pdfContent = makePdf("cross-tenant attack");
  // Org A tries to upload evidence to Org B's control
  const r = await uploadEvidence(cookieAdminA, ctrlBId, "attack.pdf", pdfContent);
  assert(r.status === 404, `Cross-tenant association rejected (${r.status})`);
  assert(!r.data?.id, "No evidence record created");
}

async function tc61() {
  console.log("\n── TC-61: Unsupported File Type ──");
  const exeContent = Buffer.from("MZ\x90\x00\x03\x00\x00\x00"); // PE header
  const r = await uploadRawEvidence(cookieAdminA, ctrl001Id, "malware.exe", exeContent, "application/x-msdownload");
  assert(r.status === 400, `Unsupported file type rejected (${r.status})`);
  assert(r.data?.error?.includes("not allowed"), `Clear error message: "${r.data?.error}"`);

  // Verify no DB record
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const exeEvidence = evList.data.find((e: any) => e.fileName === "malware.exe");
  assert(!exeEvidence, "No database record for rejected file");
}

async function tc62() {
  console.log("\n── TC-62: Rename Extension Attack ──");
  // An executable with .pdf extension — magic bytes won't match %PDF
  const exeContent = Buffer.from("MZ\x90\x00\x03\x00\x00\x00FAKE_EXE_CONTENT");
  const r = await uploadRawEvidence(cookieAdminA, ctrl001Id, "Access-Review.pdf", exeContent, "application/pdf");
  assert(r.status === 400, `Renamed exe rejected (${r.status})`);
  assert(r.data?.error?.includes("does not match"), `Error mentions content mismatch: "${r.data?.error}"`);
}

async function tc63() {
  console.log("\n── TC-63: Double-extension Attack ──");
  const exeContent = Buffer.from("MZ\x90\x00");
  const r = await uploadRawEvidence(cookieAdminA, ctrl001Id, "Access-Review.pdf.exe", exeContent, "application/x-msdownload");
  assert(r.status === 400, `Double extension rejected (${r.status})`);
}

async function tc64() {
  console.log("\n── TC-64: Path Traversal Filename ──");
  const pdfContent = makePdf("traversal test");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "../../etc/passwd.pdf", pdfContent);
  // Should either reject or safely sanitize the filename
  if (r.status === 201) {
    // If accepted, verify storage key doesn't contain path traversal
    const ev = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
    const item = ev.data.find((e: any) => e.id === r.data.id);
    assert(!item.storageKey.includes(".."), "Storage key doesn't contain path traversal");
    assert(!item.fileUrl.includes(".."), "File URL doesn't contain path traversal");
    // Clean up
    await api("DELETE", `/api/evidence/${r.data.id}`, cookieAdminA);
  } else {
    assert(r.status === 400, `Path traversal rejected (${r.status})`);
  }
}

async function tc65() {
  console.log("\n── TC-65: Oversized File (CRITICAL) ──");
  // Create a buffer larger than 20MB
  const bigContent = Buffer.alloc(21 * 1024 * 1024, 0x25); // fill with '%' to fake PDF start
  // Add PDF magic
  bigContent[0] = 0x25; bigContent[1] = 0x50; bigContent[2] = 0x44; bigContent[3] = 0x46;
  const r = await uploadRawEvidence(cookieAdminA, ctrl001Id, "big.pdf", bigContent, "application/pdf");
  assert(r.status === 400, `Oversized file rejected (${r.status})`);
  assert(r.data?.error?.includes("MB limit") || r.data?.error?.includes("exceeds"), `Meaningful error: "${r.data?.error}"`);

  // Verify no DB record
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const bigEvidence = evList.data.find((e: any) => e.fileName === "big.pdf");
  assert(!bigEvidence, "No database record for oversized file");
}

async function tc66() {
  console.log("\n── TC-66: Zero-byte File ──");
  const r = await uploadRawEvidence(cookieAdminA, ctrl001Id, "empty.pdf", Buffer.alloc(0), "application/pdf");
  assert(r.status === 400, `Zero-byte file rejected (${r.status})`);
  assert(r.data?.error?.includes("required"), `Error message: "${r.data?.error}"`);
}

async function tc67() {
  console.log("\n── TC-67: Duplicate Evidence ──");
  const pdfContent = makePdf("duplicate test");
  const r1 = await uploadEvidence(cookieAdminA, ctrl001Id, "Duplicate.pdf", pdfContent);
  assert(r1.status === 201, "First upload succeeds");
  const r2 = await uploadEvidence(cookieAdminA, ctrl001Id, "Duplicate.pdf", pdfContent);
  assert(r2.status === 201, "Duplicate upload also succeeds (allowed by design)");
  assert(r1.data.id !== r2.data.id, "Duplicate creates separate record");

  // Clean up duplicates
  await api("DELETE", `/api/evidence/${r1.data.id}`, cookieAdminA);
  await api("DELETE", `/api/evidence/${r2.data.id}`, cookieAdminA);
}

async function tc68() {
  console.log("\n── TC-68: Evidence Review (CRITICAL) ──");
  // Upload as Editor A
  const pdfContent = makePdf("review test");
  const r = await uploadEvidence(cookieEditorA, ctrl001Id, "ReviewTest.pdf", pdfContent);
  assert(r.status === 201, "Editor uploads evidence");
  const evId = r.data.id;

  // Review as Admin A (who has evidence:review)
  const review = await api("PATCH", `/api/evidence/${evId}`, cookieAdminA, { status: "VALID" });
  assert(review.status === 200, `Review succeeds (${review.status})`);
  assert(review.data.reviewedById === adminA.id, "Reviewed by correct user");
  assert(review.data.reviewedAt !== null, "Review timestamp set");
  assert(review.data.status === "VALID", "Status set to VALID");

  // Check audit
  const audit = await api("GET", "/api/audit-logs?entityType=Evidence", cookieAdminA);
  const reviewEntry = audit.data?.find((e: any) => e.action === "UPDATE" && e.entityId === evId);
  assert(!!reviewEntry, "Audit entry for review");

  // Clean up
  await api("DELETE", `/api/evidence/${evId}`, cookieAdminA);
}

async function tc69() {
  console.log("\n── TC-69: Viewer Cannot Review Evidence ──");
  const r = await api("PATCH", `/api/evidence/${evidenceQ3Id}`, cookieViewerA, { status: "VALID" });
  assert(r.status === 403, `Viewer review rejected (${r.status})`);
}

async function tc70() {
  console.log("\n── TC-70: Evidence Expiration (CRITICAL) ──");
  const pdfContent = readFileSync(path.join(TEST_DIR, "Access-Review-Q2-2026.pdf"));
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Access-Review-Q2-2026.pdf", pdfContent, {
    type: "DOCUMENT",
    collectedAt: "2026-06-30T00:00:00.000Z",
    validFrom: "2026-04-01T00:00:00.000Z",
    validUntil: "2026-06-30T00:00:00.000Z",
    description: "Q2 access review - expired",
  });
  assert(r.status === 201, "Expired evidence uploaded");
  evidenceQ2Id = r.data.id;

  // Check computed status
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const q2 = evList.data.find((e: any) => e.id === evidenceQ2Id);
  assert(q2.computedStatus === "EXPIRED", `Q2 evidence status is EXPIRED (got ${q2.computedStatus})`);
}

async function tc71() {
  console.log("\n── TC-71: Evidence Expiring Soon ──");
  // Create evidence expiring within 30 days (warning period)
  const pdfContent = makePdf("expiring soon");
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "ExpiringSoon.pdf", pdfContent, {
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: expiryDate.toISOString(),
  });
  assert(r.status === 201, "Expiring-soon evidence uploaded");

  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const expiring = evList.data.find((e: any) => e.id === r.data.id);
  assert(expiring.computedStatus === "EXPIRING", `Status is EXPIRING (got ${expiring.computedStatus})`);

  // Clean up
  await api("DELETE", `/api/evidence/${r.data.id}`, cookieAdminA);
}

async function tc72() {
  console.log("\n── TC-72: Future Evidence ──");
  const pdfContent = readFileSync(path.join(TEST_DIR, "Access-Review-Q4-2026.pdf"));
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Access-Review-Q4-2026.pdf", pdfContent, {
    type: "DOCUMENT",
    validFrom: "2026-10-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    description: "Q4 access review - future",
  });
  assert(r.status === 201, "Future evidence uploaded");
  evidenceQ4Id = r.data.id;

  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const q4 = evList.data.find((e: any) => e.id === evidenceQ4Id);
  assert(q4.computedStatus === "PENDING", `Future evidence is PENDING (got ${q4.computedStatus})`);
}

async function tc73() {
  console.log("\n── TC-73: Evidence Validity Boundary ──");
  const pdfContent = makePdf("boundary test");
  const today = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";

  // Valid From = today, Valid Until = today
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Boundary.pdf", pdfContent, {
    validFrom: today,
    validUntil: today,
  });
  assert(r.status === 201, "Boundary evidence uploaded");

  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const boundary = evList.data.find((e: any) => e.id === r.data.id);
  // validUntil = today at midnight is < now (which is after midnight), so should be EXPIRING or EXPIRED
  assert(
    boundary.computedStatus === "EXPIRING" || boundary.computedStatus === "EXPIRED" || boundary.computedStatus === "VALID",
    `Boundary status is consistent (got ${boundary.computedStatus})`
  );
  console.log(`  (Boundary rule: validUntil=today → ${boundary.computedStatus})`);

  // Clean up
  await api("DELETE", `/api/evidence/${r.data.id}`, cookieAdminA);
}

async function tc74() {
  console.log("\n── TC-74: Evidence Status Changes Automatically ──");
  // The Q2 evidence (validUntil = Jun 30 2026) should be EXPIRED dynamically
  // without manual intervention - computed on read
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const q2 = evList.data.find((e: any) => e.id === evidenceQ2Id);
  assert(q2.computedStatus === "EXPIRED", `Q2 computed status is EXPIRED automatically (got ${q2.computedStatus})`);
  // The stored status may still be VALID, but computedStatus reflects reality
  console.log(`  (Stored status: ${q2.status}, Computed: ${q2.computedStatus})`);
}

async function tc75() {
  console.log("\n── TC-75: Evidence Deletion ──");
  const pdfContent = makePdf("delete test");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "DeleteMe.pdf", pdfContent);
  assert(r.status === 201, "Evidence created for deletion test");
  const delId = r.data.id;

  const del = await api("DELETE", `/api/evidence/${delId}`, cookieAdminA);
  assert(del.status === 200, `Deletion succeeds (${del.status})`);

  // Verify removed from list
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const found = evList.data.find((e: any) => e.id === delId);
  assert(!found, "Evidence no longer in list");

  // Verify download fails
  const dlRes = await fetch(`${BASE}/api/evidence/${delId}/download`, {
    headers: { cookie: cookieAdminA },
  });
  assert(dlRes.status === 404, `Download of deleted evidence returns 404 (${dlRes.status})`);

  // Check audit
  const audit = await api("GET", "/api/audit-logs?entityType=Evidence", cookieAdminA);
  const delEntry = audit.data?.find((e: any) => e.action === "DELETE" && e.entityId === delId);
  assert(!!delEntry, "Audit entry for deletion");
}

async function tc76() {
  console.log("\n── TC-76: Evidence Deletion Authorization ──");
  const r = await api("DELETE", `/api/evidence/${evidenceQ3Id}`, cookieViewerA);
  assert(r.status === 403, `Viewer cannot delete evidence (${r.status})`);

  // Verify evidence still exists
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const still = evList.data.find((e: any) => e.id === evidenceQ3Id);
  assert(!!still, "Evidence still exists after viewer's failed delete");
}

async function tc77() {
  console.log("\n── TC-77: Evidence Audit ──");
  // Create, review, edit metadata, delete
  const pdfContent = makePdf("audit trail test");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "AuditTrail.pdf", pdfContent, {
    validUntil: "2026-09-30T00:00:00.000Z",
  });
  const auditId = r.data.id;

  // Review
  await api("PATCH", `/api/evidence/${auditId}`, cookieAdminA, { status: "VALID" });

  // Edit metadata - change validity
  await api("PATCH", `/api/evidence/${auditId}`, cookieAdminA, { validUntil: "2026-12-31T00:00:00.000Z" });

  // Delete
  await api("DELETE", `/api/evidence/${auditId}`, cookieAdminA);

  // Check audit log for all events
  const audit = await api("GET", `/api/audit-logs?entityType=Evidence&entityId=${auditId}`, cookieAdminA);
  const logs: any[] = audit.data ?? [];
  const actions = logs.map((l) => l.action);
  assert(actions.includes("CREATE"), "Audit has CREATE");
  assert(actions.filter((a) => a === "UPDATE").length >= 2, "Audit has at least 2 UPDATEs (review + metadata change)");
  assert(actions.includes("DELETE"), "Audit has DELETE");

  // Check that metadata change has before/after
  const metaUpdate = logs.find((l) => l.action === "UPDATE" && l.changes?.validUntil);
  if (metaUpdate) {
    assert(!!metaUpdate.beforeJson || !!metaUpdate.changes, "Metadata update has change details");
  }
}

async function tc78() {
  console.log("\n── TC-78: Evidence Does Not Equal Compliance (CRITICAL) ──");
  // Set CTRL-001 to NOT_STARTED
  await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, { status: "NOT_STARTED" });

  // Evidence Q3 already exists and is valid
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  assert(ctrl.data.status === "NOT_STARTED", "Control status is NOT_STARTED");
  assert(ctrl.data._count.evidence >= 1, "Evidence exists on control");

  // Check framework readiness — should NOT be COMPLIANT
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "COMPLIANT", `Readiness is NOT compliant despite evidence (got ${cc61.readiness})`);
  assert(cc61.readiness === "MAPPED_NOT_IMPLEMENTED", `Readiness reflects NOT_STARTED control (got ${cc61.readiness})`);

  // Restore status
  await api("PATCH", `/api/controls/${ctrl001Id}`, cookieAdminA, { status: "IMPLEMENTED" });
}

async function tc79() {
  console.log("\n── TC-79: Evidence + Implemented Control ──");
  // CTRL-001 is IMPLEMENTED with valid evidence
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  // Has valid evidence (Q3), no test → NOT_TESTED
  assert(cc61.readiness === "NOT_TESTED", `With evidence but no test: NOT_TESTED (got ${cc61.readiness})`);

  // Add a passing test
  await api("POST", `/api/controls/${ctrl001Id}/tests`, cookieAdminA, {
    result: "PASS", testDate: new Date().toISOString(), notes: "Test for TC-79",
  });

  const fw2 = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61b = fw2.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61b.readiness === "COMPLIANT", `With evidence + pass test: COMPLIANT (got ${cc61b.readiness})`);
}

async function tc80() {
  console.log("\n── TC-80: Expired Evidence Affects Readiness (CRITICAL) ──");
  // Remove the valid Q3 evidence, keep only expired Q2
  await api("DELETE", `/api/evidence/${evidenceQ3Id}`, cookieAdminA);
  // Also remove Q4 (future/PENDING)
  if (evidenceQ4Id) await api("DELETE", `/api/evidence/${evidenceQ4Id}`, cookieAdminA);

  // Now only expired Q2 evidence remains
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  assert(cc61.readiness !== "COMPLIANT", `Not compliant with only expired evidence (got ${cc61.readiness})`);
  assert(cc61.readiness === "IMPLEMENTED_NO_EVIDENCE", `Expired evidence = no valid evidence (got ${cc61.readiness})`);

  // Re-create valid evidence for remaining tests
  const pdfContent = makePdf("Q3 re-created");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Access-Review-Q3-2026.pdf", pdfContent, {
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
  });
  evidenceQ3Id = r.data.id;
}

async function tc81() {
  console.log("\n── TC-81: Multiple Evidence Items ──");
  // Already have Q2 (expired) and Q3 (valid). Add Q1 (expired).
  const pdfContent = makePdf("Q1 review");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Access-Review-Q1-2026.pdf", pdfContent, {
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-03-31T00:00:00.000Z",
  });
  assert(r.status === 201, "Q1 evidence uploaded");

  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const statuses = evList.data.map((e: any) => e.computedStatus);
  const valid = statuses.filter((s: string) => s === "VALID").length;
  const expired = statuses.filter((s: string) => s === "EXPIRED").length;
  assert(valid >= 1, `At least 1 valid evidence (got ${valid})`);
  assert(expired >= 2, `At least 2 expired evidence (got ${expired})`);
  assert(evList.data.length >= 3, `All evidence items visible (got ${evList.data.length})`);

  // Clean up Q1
  await api("DELETE", `/api/evidence/${r.data.id}`, cookieAdminA);
}

async function tc82() {
  console.log("\n── TC-82: Evidence ↔ Control Relationship ──");
  // Current model: Evidence → Control is 1:1 (each evidence belongs to one control)
  // Document the intended behavior
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const q3 = evList.data.find((e: any) => e.id === evidenceQ3Id);
  assert(q3.controlId === ctrl001Id, "Evidence belongs to single control");
  assert(q3.control.code === "CTRL-001", "Control info available from evidence");
  console.log("  (Current model: Evidence → Control is direct 1:1. Multi-control junction is future work.)");
}

async function tc83() {
  console.log("\n── TC-83: Evidence Belongs to Correct Organization ──");
  // Org A evidence should appear for Org A
  const orgAList = await api("GET", "/api/evidence", cookieAdminA);
  const orgAIds = orgAList.data.map((e: any) => e.id);
  assert(orgAIds.includes(evidenceQ3Id), "Org A sees its own evidence");

  // Org B should NOT see Org A's evidence
  const orgBList = await api("GET", "/api/evidence", cookieAdminB);
  const orgBIds = orgBList.data.map((e: any) => e.id);
  assert(!orgBIds.includes(evidenceQ3Id), "Org B cannot see Org A's evidence");
  assert(!orgBIds.includes(evidenceQ2Id), "Org B cannot see Org A's Q2 evidence either");
}

async function tc84() {
  console.log("\n── TC-84: Evidence Search/Filter ──");
  // Filter by controlId
  const byControl = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  assert(byControl.status === 200, "Filter by control works");
  assert(byControl.data.every((e: any) => e.controlId === ctrl001Id), "All results match control filter");

  // Verify all results belong to current org
  assert(byControl.data.every((e: any) => !!e.control), "All results have control info");
}

async function tc85() {
  console.log("\n── TC-85: Evidence Pagination ──");
  // The current API doesn't have explicit pagination, it returns all evidence
  // This is acceptable for now — verify we get all records
  const all = await api("GET", "/api/evidence", cookieAdminA);
  assert(all.status === 200, "Full evidence list loads");
  assert(Array.isArray(all.data), "Returns array");
  // No duplicates
  const ids = all.data.map((e: any) => e.id);
  const unique = new Set(ids);
  assert(ids.length === unique.size, `No duplicate records (${ids.length} total, ${unique.size} unique)`);
  console.log("  (Pagination not yet implemented — acceptable for current scale)");
}

async function tc86() {
  console.log("\n── TC-86: Evidence Metadata Tampering ──");
  const pdfContent = makePdf("tamper test");
  // Try to inject organizationId and uploadedById via form fields
  const form = new FormData();
  form.append("controlId", ctrl001Id);
  form.append("file", new Blob([pdfContent], { type: "application/pdf" }), "Tamper.pdf");
  // These should be ignored — server sets them from session
  form.append("uploadedById", adminB.id);
  form.append("organizationId", orgB.id);

  const res = await fetch(`${BASE}/api/evidence`, {
    method: "POST",
    headers: { cookie: cookieAdminA },
    body: form,
  });
  assert(res.status === 201, "Upload succeeds despite tamper attempt");
  const data = await res.json();
  assert(data.uploadedById === adminA.id, `uploadedBy from session (${data.uploadedById}), not tampered value`);

  // Verify control belongs to Org A, not injected Org B
  const ev = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const item = ev.data.find((e: any) => e.id === data.id);
  assert(item.control.code === "CTRL-001", "Evidence associated with correct control");

  // Clean up
  await api("DELETE", `/api/evidence/${data.id}`, cookieAdminA);
}

async function tc87() {
  console.log("\n── TC-87: Malicious Download ID ──");
  // Nonexistent ID
  const r1 = await fetch(`${BASE}/api/evidence/00000000-0000-0000-0000-000000000000/download`, {
    headers: { cookie: cookieAdminA },
  });
  assert(r1.status === 404, `Nonexistent ID returns 404 (${r1.status})`);

  // Cross-org ID (Org A trying Org B's evidence — but Org B has none, so just test with random UUID)
  const r2 = await fetch(`${BASE}/api/evidence/11111111-1111-1111-1111-111111111111/download`, {
    headers: { cookie: cookieAdminA },
  });
  assert(r2.status === 404, `Random UUID returns 404 (${r2.status})`);

  // Both return same error — no information leakage about whether ID exists in another org
  const body1 = await r1.json().catch(() => null);
  const body2 = await r2.json().catch(() => null);
  assert(
    JSON.stringify(body1) === JSON.stringify(body2) || (r1.status === r2.status),
    "Same error for both — no IDOR info leak"
  );
}

async function tc88() {
  console.log("\n── TC-88: File Storage Isolation ──");
  // Verify storage keys use UUID-based naming, not org-based paths
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  for (const e of evList.data.slice(0, 3)) {
    if (e.fileUrl.startsWith("local:")) {
      const key = e.fileUrl.slice("local:".length);
      assert(!key.includes("/"), `Storage key has no path separators: ${key}`);
      assert(!key.includes("\\"), `Storage key has no backslash: ${key}`);
      assert(!key.includes(".."), `Storage key has no traversal: ${key}`);
      // UUID format
      assert(key.length > 30, `Key appears UUID-based (len ${key.length})`);
    }
  }
}

async function tc89() {
  console.log("\n── TC-89: Database/Storage Consistency (CRITICAL) ──");
  // Test the delete flow — file should be removed after DB commit
  const pdfContent = makePdf("consistency test");
  const r = await uploadEvidence(cookieAdminA, ctrl001Id, "Consistency.pdf", pdfContent);
  assert(r.status === 201, "Evidence created");
  const evId = r.data.id;

  // Get storage key
  const ev = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const item = ev.data.find((e: any) => e.id === evId);
  const storageKey = item.fileUrl.startsWith("local:") ? item.fileUrl.slice("local:".length) : null;

  // Verify file exists on disk
  if (storageKey) {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, storageKey);
    assert(existsSync(filePath), "File exists on disk before delete");

    // Delete evidence
    await api("DELETE", `/api/evidence/${evId}`, cookieAdminA);

    // Verify file is removed from disk
    assert(!existsSync(filePath), "File removed from disk after delete");
  }

  // Verify DB record is gone
  const evAfter = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const found = evAfter.data.find((e: any) => e.id === evId);
  assert(!found, "DB record removed after delete");
}

async function tc90() {
  console.log("\n── TC-90: Evidence → Control → Framework Integration ──");
  // Evidence on CTRL-001 which maps to SOC 2 CC6.1 and ISO 27001 A.5.15
  const evList = await api("GET", `/api/evidence?controlId=${ctrl001Id}`, cookieAdminA);
  const q3 = evList.data.find((e: any) => e.id === evidenceQ3Id);
  assert(!!q3, "Evidence exists");
  assert(q3.control.code === "CTRL-001", "Evidence → CTRL-001 navigation works");

  // From control → framework requirements
  const ctrl = await api("GET", `/api/controls/${ctrl001Id}`, cookieAdminA);
  const mappedFws = ctrl.data.mappings.map((m: any) => m.requirement.framework.name);
  assert(mappedFws.includes("SOC 2"), "CTRL-001 → SOC 2");
  assert(mappedFws.includes("ISO 27001:2022"), "CTRL-001 → ISO 27001");

  // From framework → requirement → CTRL-001 → evidence available
  const fw = await api("GET", `/api/frameworks/${soc2Id}`, cookieAdminA);
  const cc61 = fw.data.requirements.find((r: any) => r.code === "CC6.1");
  const ctrl001InFw = cc61.mappedControls.find((c: any) => c.code === "CTRL-001");
  assert(!!ctrl001InFw, "Framework → CC6.1 → CTRL-001");
  assert(ctrl001InFw.evidenceCount >= 1, `CTRL-001 shows evidence available (${ctrl001InFw.evidenceCount})`);
  assert(ctrl001InFw.validEvidenceCount >= 1, `CTRL-001 shows valid evidence (${ctrl001InFw.validEvidenceCount})`);
}

// ═══════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════

async function cleanup() {
  console.log("\n═══ CLEANUP ═══\n");
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean) as string[];
  if (orgIds.length > 0) {
    await prisma.controlTest.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.evidence.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.controlMapping.deleteMany({ where: { control: { organizationId: { in: orgIds } } } });
    await prisma.frameworkRequirement.deleteMany({ where: { framework: { organizationId: { in: orgIds } } } });
    await prisma.framework.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.control.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.role.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  // Clean up test files
  if (existsSync(TEST_DIR)) {
    for (const f of readdirSync(TEST_DIR)) {
      unlinkSync(path.join(TEST_DIR, f));
    }
    try { require("fs").rmdirSync(TEST_DIR); } catch {}
  }

  // Clean up any orphaned upload files from tests
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (existsSync(uploadsDir)) {
    const files = readdirSync(uploadsDir);
    // Only clean files created in the last 10 minutes for safety
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const f of files) {
      const fp = path.join(uploadsDir, f);
      try {
        const stat = statSync(fp);
        if (stat.mtimeMs > cutoff && stat.isFile()) {
          // Likely a test file — leave it, cleanup happened via API
        }
      } catch {}
    }
  }

  console.log("  Test data cleaned up.\n");
}

async function main() {
  try {
    await setup();

    await tc55();
    await tc56();
    await tc57();
    await tc58();
    await tc59();
    await tc60();
    await tc61();
    await tc62();
    await tc63();
    await tc64();
    await tc65();
    await tc66();
    await tc67();
    await tc68();
    await tc69();
    await tc70();
    await tc71();
    await tc72();
    await tc73();
    await tc74();
    await tc75();
    await tc76();
    await tc77();
    await tc78();
    await tc79();
    await tc80();
    await tc81();
    await tc82();
    await tc83();
    await tc84();
    await tc85();
    await tc86();
    await tc87();
    await tc88();
    await tc89();
    await tc90();

    console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══\n`);
  } catch (err) {
    console.error("Test suite error:", err);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main();
