import { createHash } from "node:crypto";

// Data-review exercises: each learner gets their own realistic export (access list, asset register, change
// tickets...) generated from their practice company's industry profile, with problems planted in it. The learner
// flags rows; the answer key never leaves the server until they pass.

export type IndustryProfile = {
  id: string;
  industry: string;
  company: string;
  city: string;
  coreSystem: { name: string; roles: string[]; privilegedRoles: string[]; sodConflict: string[] };
  systems: string[];
  endpoints: string[];
  dataLabel: string;
  vendors: { name: string; service: string; category: string; criticality: string; data: string }[];
  departments: string[];
};

export type Column = { key: string; label: string };
export type Table = { title: string; columns: Column[]; rows: Record<string, string>[] };
export type Option = { value: string; label: string; explain: string };
export type Exercise = {
  kind: string;
  asOf: string;
  notes: string[];
  table: Table; // rows have an "id" cell; the learner flags these
  reference?: Table; // read-only data to compare against (e.g. the HR roster)
  options: Option[]; // the first is "OK"
  answers: Record<string, string>; // row id → option value
};

const DAY = 86400000;
const OK: Option = { value: "OK", label: "No issue", explain: "" };

// Small seeded PRNG so a learner's data stays the same between visits.
function rng(seed: string) {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)],
    shuffle: <T,>(xs: T[]) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
type Rng = ReturnType<typeof rng>;

const FIRST = ["Aarav", "Diya", "Kabir", "Ira", "Vihaan", "Anika", "Reyansh", "Myra", "Arnav", "Sara", "Dev", "Tara", "Rohan", "Zoya",
  "Nikhil", "Pooja", "Sameer", "Leela", "Yusuf", "Elena", "Marcus", "Chen", "Fatima", "Olivia", "Ravi", "Sneha", "Harsh", "Asha",
  "Manav", "Rhea", "Kunal", "Meghna", "Tanvi", "Jai", "Nora", "Ibrahim", "Pallavi", "Akash", "Lina", "Vivek"];
const LAST = ["Sharma", "Patel", "Iyer", "Khan", "Reddy", "Nair", "Gupta", "Das", "Mehta", "Rao", "Singh", "Joshi", "Bose", "Kapoor",
  "Fernandes", "Menon", "Chopra", "Pillai", "Kulkarni", "Ali", "Thomas", "Wong", "Garcia", "Banerjee"];

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const ago = (base: Date, days: number) => fmt(new Date(base.getTime() - days * DAY));

function people(r: Rng, n: number) {
  const seen = new Set<string>();
  const out: { name: string; id: string }[] = [];
  while (out.length < n) {
    const name = `${r.pick(FIRST)} ${r.pick(LAST)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const [f, l] = name.toLowerCase().split(" ");
    out.push({ name, id: `${f}.${l}` });
  }
  return out;
}

// Places each planted issue on a different random row; the rest stay clean.
function plant<T extends string>(r: Rng, total: number, issues: T[]) {
  const slots = r.shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, issues.length);
  const at = new Map<number, T>();
  slots.forEach((s, i) => at.set(s, issues[i]));
  return at;
}

function accessReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const cs = p.coreSystem;
  const options: Option[] = [OK,
    { value: "LEAVER", label: "Leaver still active", explain: "HR shows this person has left, but the account is still enabled." },
    { value: "MOVER", label: "Role no longer needed (mover)", explain: "This person moved department and kept a role from their old job." },
    { value: "DORMANT", label: "Dormant account", explain: "No login in over 90 days; disable it or confirm it's still needed." },
    { value: "SHARED", label: "Shared or generic account", explain: "Not tied to one person, so actions can't be traced to anyone." },
    { value: "PRIV_NO_MFA", label: "Privileged without MFA", explain: "A privileged role without MFA is the easiest way in for an attacker." },
    { value: "SOD", label: "Segregation of duties conflict", explain: `Holds both ${cs.sodConflict.join(" and ")}, so one person can do and approve the same action.` },
  ];
  const issues = ["LEAVER", "LEAVER", "MOVER", "DORMANT", "DORMANT", "SHARED", "PRIV_NO_MFA", "SOD"];
  const n = 34;
  const staff = people(r, n);
  const at = plant(r, n, issues);
  const rows: Record<string, string>[] = [];
  const roster: Record<string, string>[] = [];
  const answers: Record<string, string> = {};
  staff.forEach((s, i) => {
    const issue = at.get(i) ?? "OK";
    const dept = r.pick(p.departments);
    let role = r.pick(cs.roles);
    let hrDept = dept;
    let hrStatus = "Active";
    let leftOn = "";
    let lastLogin = ago(asOf, r.int(0, 30));
    let mfa = r.next() < 0.85 ? "Yes" : "No";
    let userId = s.id;
    if (r.next() < 0.12) role = r.pick(cs.privilegedRoles);
    if (cs.privilegedRoles.includes(role)) mfa = "Yes";
    if (issue === "LEAVER") { hrStatus = "Left"; leftOn = ago(asOf, r.int(20, 120)); lastLogin = ago(asOf, r.int(1, 15)); }
    if (issue === "MOVER") { role = cs.privilegedRoles[0]; mfa = "Yes"; hrDept = p.departments.find((d) => d !== dept) ?? dept; }
    if (issue === "DORMANT") lastLogin = ago(asOf, r.int(110, 300));
    if (issue === "SHARED") { userId = `${r.pick(["ops", "frontdesk", "team", "shift", "support"])}-shared${r.int(1, 9)}`; role = r.pick(cs.roles); }
    if (issue === "PRIV_NO_MFA") { role = cs.privilegedRoles[r.int(0, cs.privilegedRoles.length - 1)]; mfa = "No"; }
    if (issue === "SOD") role = cs.sodConflict.join(" + ");
    const id = `U${String(i + 1).padStart(3, "0")}`;
    rows.push({ id, userId, name: issue === "SHARED" ? "(shared)" : s.name, department: dept, role, mfa, lastLogin, status: "Enabled" });
    if (issue !== "SHARED") roster.push({ employee: s.name, department: hrDept, status: hrStatus, leftOn });
    answers[id] = issue;
  });
  return {
    kind: "access_review", asOf: fmt(asOf), options, answers,
    notes: [
      `System: ${cs.name}. Privileged roles: ${cs.privilegedRoles.join(", ")}.`,
      `Segregation of duties: nobody may hold both ${cs.sodConflict.join(" and ")}.`,
      "Dormant: no login in 90 days. Every privileged account must have MFA.",
    ],
    table: {
      title: `${cs.name} user export`,
      columns: [
        { key: "id", label: "#" }, { key: "userId", label: "User ID" }, { key: "name", label: "Name" },
        { key: "department", label: "Department" }, { key: "role", label: "Role" }, { key: "mfa", label: "MFA" },
        { key: "lastLogin", label: "Last login" }, { key: "status", label: "Account" },
      ],
      rows,
    },
    reference: {
      title: "HR roster",
      columns: [{ key: "employee", label: "Employee" }, { key: "department", label: "Department" }, { key: "status", label: "Status" }, { key: "leftOn", label: "Left on" }],
      rows: r.shuffle(roster),
    },
  };
}

function assetInventory(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "NO_OWNER", label: "No owner", explain: "Nobody is accountable for patching, access or disposal." },
    { value: "UNENCRYPTED", label: "Laptop not encrypted", explain: "A lost or stolen laptop without disk encryption is a data breach." },
    { value: "EOL_OS", label: "Unsupported OS", explain: "The vendor no longer ships security fixes for this operating system." },
    { value: "NO_EDR", label: "No endpoint security agent", explain: "Malware on this device wouldn't be detected or blocked." },
    { value: "STALE", label: "Not seen in 60+ days", explain: "Lost, stolen or decommissioned without updating the register." },
  ];
  const issues = ["NO_OWNER", "NO_OWNER", "UNENCRYPTED", "UNENCRYPTED", "EOL_OS", "EOL_OS", "NO_EDR", "STALE"];
  const n = 32;
  const owners = people(r, 12);
  const at = plant(r, n, issues);
  const types = [...p.endpoints, "Laptop", "Laptop"];
  const goodOs = { laptop: ["Windows 11 24H2", "Windows 11 25H2"], server: ["Ubuntu 22.04", "Windows Server 2022", "RHEL 9"], device: ["Vendor firmware 4.2", "Android 15", "Embedded Linux 6.1"] };
  const badOs = { laptop: ["Windows 7 SP1", "Windows 10 22H2"], server: ["Windows Server 2012 R2", "CentOS 7"], device: ["Windows XP Embedded", "Android 8"] };
  const answers: Record<string, string> = {};
  const rows = Array.from({ length: n }, (_, i) => {
    let issue = at.get(i) ?? "OK";
    let type = r.pick(types);
    if (issue === "UNENCRYPTED") type = "Laptop";
    const lower = type.toLowerCase();
    const cls = /laptop|macbook|pc|desktop|workstation|client/.test(lower) ? "laptop" : /server|node|instance|runner|machine/.test(lower) ? "server" : "device";
    const isLaptop = /laptop|macbook/.test(lower);
    if (issue === "UNENCRYPTED" && !isLaptop) issue = "OK";
    const id = `A${String(i + 1).padStart(3, "0")}`;
    const row = {
      id, tag: `${p.id.slice(0, 3).toUpperCase()}-${String(1000 + i * 7)}`, type,
      owner: issue === "NO_OWNER" ? "" : r.pick(owners).name,
      os: issue === "EOL_OS" ? r.pick(badOs[cls]) : /macbook/.test(lower) ? "macOS 15" : r.pick(goodOs[cls]),
      encrypted: isLaptop ? (issue === "UNENCRYPTED" ? "No" : "Yes") : "n/a",
      agent: issue === "NO_EDR" ? "Not installed" : "Healthy",
      lastSeen: ago(asOf, issue === "STALE" ? r.int(75, 200) : r.int(0, 10)),
    };
    answers[id] = issue;
    return row;
  });
  return {
    kind: "asset_inventory", asOf: fmt(asOf), options, answers,
    notes: ["Laptops must have full-disk encryption; other devices show n/a.", "Every asset needs a named owner and a healthy endpoint security agent where one can be installed.", "Not seen for over 60 days means the asset must be located or written off."],
    table: {
      title: `${p.company} asset register`,
      columns: [{ key: "id", label: "#" }, { key: "tag", label: "Asset tag" }, { key: "type", label: "Type" }, { key: "owner", label: "Owner" },
        { key: "os", label: "OS / firmware" }, { key: "encrypted", label: "Encrypted" }, { key: "agent", label: "Security agent" }, { key: "lastSeen", label: "Last seen" }],
      rows,
    },
  };
}

function changeReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "NO_APPROVAL", label: "No approval", explain: "Went to production without anyone approving it." },
    { value: "LATE_APPROVAL", label: "Approved after deployment", explain: "The approval was recorded after the change was already live." },
    { value: "SELF_APPROVED", label: "Self-approved", explain: "The requester approved their own change." },
    { value: "NO_TESTING", label: "No test evidence", explain: "Nothing shows the change was tested before release." },
    { value: "EMERGENCY_NO_PIR", label: "Emergency change without review", explain: "Emergency changes skip approval, so they need a post-implementation review." },
  ];
  const issues = ["NO_APPROVAL", "LATE_APPROVAL", "LATE_APPROVAL", "SELF_APPROVED", "NO_TESTING", "NO_TESTING", "EMERGENCY_NO_PIR"];
  const n = 24;
  const devs = people(r, 10);
  const at = plant(r, n, issues);
  const verbs = ["Update", "Patch", "Add", "Fix", "Upgrade", "Change", "Remove"];
  const things = ["login timeout", "TLS certificate", "report export", "database index", "API rate limit", "password policy", "user role", "batch schedule", "firewall object", "library version"];
  const answers: Record<string, string> = {};
  const rows = Array.from({ length: n }, (_, i) => {
    const issue = at.get(i) ?? "OK";
    const requester = r.pick(devs).name;
    let approver = r.pick(devs.filter((d) => d.name !== requester)).name;
    const deployed = new Date(asOf.getTime() - r.int(2, 28) * DAY);
    let approved = new Date(deployed.getTime() - r.int(1, 4) * DAY);
    let type = r.next() < 0.75 ? "Normal" : "Standard";
    let testing = r.pick(["UAT sign-off attached", "Test run #" + r.int(100, 999), "QA report attached"]);
    let pir = "n/a";
    if (issue === "NO_APPROVAL") approver = "";
    if (issue === "LATE_APPROVAL") approved = new Date(deployed.getTime() + r.int(1, 5) * DAY);
    if (issue === "SELF_APPROVED") approver = requester;
    if (issue === "NO_TESTING") testing = "";
    if (issue === "EMERGENCY_NO_PIR") { type = "Emergency"; pir = "Not done"; }
    else if (r.next() < 0.1) { type = "Emergency"; pir = "Done " + fmt(new Date(deployed.getTime() + 2 * DAY)); }
    const id = `C${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return {
      id, ticket: `CHG-${r.int(10000, 99999)}`, system: r.pick(p.systems), summary: `${r.pick(verbs)} ${r.pick(things)}`, type,
      requester, approver, approvedOn: approver ? fmt(approved) : "", deployedOn: fmt(deployed), testing, pir,
    };
  });
  return {
    kind: "change_review", asOf: fmt(asOf), options, answers,
    notes: ["Normal changes need approval before deployment by someone other than the requester, plus test evidence.", "Standard changes are pre-approved but still need test evidence.", "Emergency changes need a post-implementation review (PIR)."],
    table: {
      title: "Production changes this month",
      columns: [{ key: "id", label: "#" }, { key: "ticket", label: "Ticket" }, { key: "system", label: "System" }, { key: "summary", label: "Summary" },
        { key: "type", label: "Type" }, { key: "requester", label: "Requester" }, { key: "approver", label: "Approver" }, { key: "approvedOn", label: "Approved" },
        { key: "deployedOn", label: "Deployed" }, { key: "testing", label: "Test evidence" }, { key: "pir", label: "PIR" }],
      rows,
    },
  };
}

function vulnTriage(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "SLA_BREACH", label: "Past fix deadline", explain: "Open longer than the policy allows for its severity." },
    { value: "EXCEPTION_EXPIRED", label: "Exception expired", explain: "The risk acceptance ran out; it's overdue again unless renewed." },
    { value: "REOPENED", label: "Marked fixed but still detected", explain: "Closed in the tracker, yet the latest scan still finds it." },
  ];
  const issues = ["SLA_BREACH", "SLA_BREACH", "SLA_BREACH", "EXCEPTION_EXPIRED", "EXCEPTION_EXPIRED", "REOPENED", "REOPENED"];
  const n = 26;
  const at = plant(r, n, issues);
  const vulns = [["Critical", "Remote code execution in web server"], ["Critical", "SQL injection in login form"], ["High", "Outdated OpenSSL"],
    ["High", "SMB signing not required"], ["Medium", "TLS 1.0 enabled"], ["Medium", "Missing security headers"], ["Low", "Server version disclosed"], ["High", "Default admin password"]];
  const answers: Record<string, string> = {};
  const rows = Array.from({ length: n }, (_, i) => {
    const issue = at.get(i) ?? "OK";
    let [sev, title] = r.pick(vulns);
    if (issue === "SLA_BREACH" || issue === "EXCEPTION_EXPIRED") [sev, title] = r.pick(vulns.filter((v) => v[0] === "Critical" || v[0] === "High"));
    const sla = sev === "Critical" ? 15 : sev === "High" ? 30 : sev === "Medium" ? 90 : 180;
    let open = r.int(1, Math.max(2, sla - 3));
    let status = "Open";
    let exception = "";
    let lastScan = "Detected";
    if (issue === "SLA_BREACH") open = sla + r.int(5, 60);
    if (issue === "EXCEPTION_EXPIRED") { open = sla + r.int(20, 90); status = "Risk accepted"; exception = ago(asOf, r.int(3, 40)); }
    if (issue === "REOPENED") { status = "Closed"; open = r.int(10, 40); }
    if (issue === "OK" && r.next() < 0.15) { status = "Risk accepted"; open = sla + r.int(5, 30); exception = fmt(new Date(asOf.getTime() + r.int(20, 120) * DAY)); }
    if (issue === "OK" && r.next() < 0.15) { status = "Closed"; lastScan = "Not detected"; }
    const id = `V${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return { id, host: `${r.pick(p.systems)}-${r.int(1, 9)}`, severity: sev, title, firstSeen: ago(asOf, open), status, exceptionUntil: exception, latestScan: lastScan };
  });
  return {
    kind: "vuln_triage", asOf: fmt(asOf), options, answers,
    notes: [`Scan date: ${fmt(asOf)}. Fix deadlines: Critical 15 days, High 30, Medium 90, Low 180.`, "A risk-accepted finding is fine only until its exception date."],
    table: {
      title: "Monthly vulnerability scan",
      columns: [{ key: "id", label: "#" }, { key: "host", label: "Host" }, { key: "severity", label: "Severity" }, { key: "title", label: "Finding" },
        { key: "firstSeen", label: "First seen" }, { key: "status", label: "Status" }, { key: "exceptionUntil", label: "Exception until" }, { key: "latestScan", label: "Latest scan" }],
      rows,
    },
  };
}

function firewallReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "ANY_ANY", label: "Any-to-any rule", explain: "Allows all traffic; the firewall isn't doing its job for this rule." },
    { value: "ADMIN_EXPOSED", label: "Admin port open to internet", explain: "RDP, SSH or database ports reachable from anywhere invite brute force and exploits." },
    { value: "NO_OWNER", label: "No owner or ticket", explain: "Nobody can say why the rule exists, so it can't be reviewed." },
    { value: "UNUSED", label: "Unused for 180+ days", explain: "Unused rules widen the attack surface for no benefit." },
    { value: "EXPIRED_TEMP", label: "Expired temporary rule", explain: "A temporary rule past its end date should have been removed." },
  ];
  const issues = ["ANY_ANY", "ADMIN_EXPOSED", "ADMIN_EXPOSED", "NO_OWNER", "NO_OWNER", "UNUSED", "EXPIRED_TEMP"];
  const n = 24;
  const owners = people(r, 6);
  const at = plant(r, n, issues);
  const nets = ["10.10.0.0/16", "10.20.5.0/24", "192.168.40.0/24", "172.16.8.0/22"];
  const svc = [["HTTPS", "443"], ["HTTP", "80"], ["DNS", "53"], ["SMTP", "25"], ["NTP", "123"], ["App", "8443"]];
  const admin = [["RDP", "3389"], ["SSH", "22"], ["SQL Server", "1433"], ["PostgreSQL", "5432"]];
  const answers: Record<string, string> = {};
  const rows = Array.from({ length: n }, (_, i) => {
    const issue = at.get(i) ?? "OK";
    const target = r.pick(p.systems);
    let source = r.pick([...nets, "Partner VPN"]);
    let dest = `${target} (${r.pick(nets)})`;
    let [service, port] = r.pick(svc);
    let owner = r.pick(owners).name;
    let ticket = `CHG-${r.int(10000, 99999)}`;
    let lastHit = ago(asOf, r.int(0, 20));
    let expires = "";
    if (issue === "ANY_ANY") { source = "Any"; dest = "Any"; service = "Any"; port = "Any"; }
    if (issue === "ADMIN_EXPOSED") { source = "Any (internet)"; [service, port] = r.pick(admin); }
    if (issue === "NO_OWNER") { owner = ""; ticket = ""; }
    if (issue === "UNUSED") lastHit = ago(asOf, r.int(200, 500));
    if (issue === "EXPIRED_TEMP") expires = ago(asOf, r.int(10, 90));
    if (issue === "OK" && r.next() < 0.15) expires = fmt(new Date(asOf.getTime() + r.int(10, 60) * DAY));
    const id = `R${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return { id, rule: String(100 + i * 10), source, destination: dest, service: `${service} ${port}`, action: "Allow", owner, ticket, lastHit, expires };
  });
  return {
    kind: "firewall_review", asOf: fmt(asOf), options, answers,
    notes: [`Review date: ${fmt(asOf)}.`, "Every rule needs an owner and the change ticket that created it.", "Temporary rules show an expiry date."],
    table: {
      title: "Perimeter firewall rules",
      columns: [{ key: "id", label: "#" }, { key: "rule", label: "Rule" }, { key: "source", label: "Source" }, { key: "destination", label: "Destination" },
        { key: "service", label: "Service" }, { key: "action", label: "Action" }, { key: "owner", label: "Owner" }, { key: "ticket", label: "Ticket" },
        { key: "lastHit", label: "Last hit" }, { key: "expires", label: "Expires" }],
      rows,
    },
  };
}

function vendorReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "NO_DPA", label: "Personal data, no DPA", explain: "Processes personal data without a signed data processing agreement." },
    { value: "REVIEW_OVERDUE", label: "Review overdue", explain: "Critical and high vendors must be reassessed at least every 12 months." },
    { value: "CERT_EXPIRED", label: "Certificate or report expired", explain: "The SOC 2 report or ISO certificate relied on is out of date." },
    { value: "NEVER_ASSESSED", label: "Never assessed", explain: "Onboarded without any security review." },
  ];
  const filler = [["OfficeSuite", "Email and documents", "SAAS"], ["CloudStore", "File sharing", "SAAS"], ["PayrollPro", "Payroll", "HR"],
    ["TravelEase", "Business travel", "OTHER"], ["SecureShred", "Paper shredding", "OTHER"], ["LegalLink", "Outside counsel", "LEGAL"],
    ["PrintHub", "Printing", "OTHER"], ["HireBoard", "Job ads", "SAAS"], ["ExpenseIt", "Expenses", "FINANCE"], ["AuditPartners", "External audit", "PROFESSIONAL_SERVICES"],
    ["SurveyNow", "Customer surveys", "SAAS"], ["CleanCo", "Facilities", "OTHER"], ["MonitorPlus", "Uptime monitoring", "SAAS"], ["BackupBox", "Offsite backup", "SECURITY"]];
  const list = [...p.vendors.map((v) => ({ name: v.name, service: v.service, criticality: v.criticality, data: v.data })),
    ...r.shuffle(filler).slice(0, 14).map(([name, service]) => ({ name, service, criticality: r.pick(["HIGH", "MEDIUM", "LOW", "LOW"]), data: r.next() < 0.5 ? "Employee personal data" : "None" }))];
  const issues = ["NO_DPA", "NO_DPA", "REVIEW_OVERDUE", "REVIEW_OVERDUE", "CERT_EXPIRED", "CERT_EXPIRED", "NEVER_ASSESSED"];
  const at = plant(r, list.length, issues);
  const answers: Record<string, string> = {};
  const rows = list.map((v, i) => {
    let issue = at.get(i) ?? "OK";
    let data = v.data;
    let crit = v.criticality;
    if (issue === "NO_DPA" && data === "None") data = "Customer personal data";
    if (issue === "REVIEW_OVERDUE" && !["CRITICAL", "HIGH"].includes(crit)) crit = "HIGH";
    const personal = data !== "None";
    let dpa = personal ? "Signed" : "n/a";
    let lastReview = ago(asOf, r.int(30, 300));
    let cert = r.pick(["SOC 2 Type II", "ISO 27001", "None"]);
    let certExpiry = cert === "None" ? "" : fmt(new Date(asOf.getTime() + r.int(30, 300) * DAY));
    if (issue === "NO_DPA") dpa = "Not signed";
    if (issue === "REVIEW_OVERDUE") lastReview = ago(asOf, r.int(420, 800));
    if (issue === "CERT_EXPIRED") { cert = r.pick(["SOC 2 Type II", "ISO 27001"]); certExpiry = ago(asOf, r.int(15, 200)); }
    if (issue === "NEVER_ASSESSED") lastReview = "Never";
    if (issue === "OK" && !["CRITICAL", "HIGH"].includes(crit) && r.next() < 0.3) lastReview = ago(asOf, r.int(400, 700)); // fine for medium/low
    const id = `T${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return { id, vendor: v.name, service: v.service, criticality: crit, data, dpa, lastReview, certificate: cert, certExpiry };
  });
  return {
    kind: "vendor_review", asOf: fmt(asOf), options, answers,
    notes: [`Today: ${fmt(asOf)}.`, "Vendors with personal data need a signed DPA.", "Critical and high vendors are reassessed every 12 months; medium and low every 24."],
    table: {
      title: `${p.company} vendor register`,
      columns: [{ key: "id", label: "#" }, { key: "vendor", label: "Vendor" }, { key: "service", label: "Service" }, { key: "criticality", label: "Criticality" },
        { key: "data", label: "Data" }, { key: "dpa", label: "DPA" }, { key: "lastReview", label: "Last assessed" }, { key: "certificate", label: "Report/cert" }, { key: "certExpiry", label: "Valid until" }],
      rows,
    },
  };
}

function trainingReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "TRAINING_OVERDUE", label: "Annual training overdue", explain: "Last security training was more than 365 days ago." },
    { value: "JOINER_UNTRAINED", label: "Joiner not trained in 30 days", explain: "New joiners must finish security training within 30 days." },
    { value: "NO_POLICY_ACK", label: "Policy not acknowledged", explain: "No record that they read and accepted the security policy." },
    { value: "NO_BGV", label: "Sensitive role without background check", explain: `Roles with access to ${p.dataLabel} need a completed background check.` },
  ];
  const issues = ["TRAINING_OVERDUE", "TRAINING_OVERDUE", "TRAINING_OVERDUE", "JOINER_UNTRAINED", "JOINER_UNTRAINED", "NO_POLICY_ACK", "NO_BGV"];
  const n = 30;
  const staff = people(r, n);
  const at = plant(r, n, issues);
  const answers: Record<string, string> = {};
  const rows = staff.map((s, i) => {
    const issue = at.get(i) ?? "OK";
    const joinedDays = r.int(90, 1500);
    let joined = ago(asOf, joinedDays);
    let trained = ago(asOf, r.int(10, Math.min(330, joinedDays - 5)));
    let ack = "Yes";
    let sensitive = r.next() < 0.35 ? "Yes" : "No";
    let bgv = sensitive === "Yes" ? "Completed" : r.pick(["Completed", "Not required"]);
    if (issue === "TRAINING_OVERDUE") { joined = ago(asOf, r.int(800, 1500)); trained = ago(asOf, r.int(380, 700)); }
    if (issue === "JOINER_UNTRAINED") { joined = ago(asOf, r.int(40, 80)); trained = ""; }
    if (issue === "NO_POLICY_ACK") ack = "No";
    if (issue === "NO_BGV") { sensitive = "Yes"; bgv = "Pending"; }
    if (issue === "OK" && r.next() < 0.15) { joined = ago(asOf, r.int(3, 20)); trained = ""; } // still inside 30 days
    const id = `E${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return { id, employee: s.name, department: r.pick(p.departments), joined, lastTraining: trained, policyAck: ack, sensitiveAccess: sensitive, backgroundCheck: bgv };
  });
  return {
    kind: "training_review", asOf: fmt(asOf), options, answers,
    notes: [`Today: ${fmt(asOf)}.`, "Training is annual; joiners have 30 days.", `"Sensitive access" means access to ${p.dataLabel}.`],
    table: {
      title: "Training and onboarding tracker",
      columns: [{ key: "id", label: "#" }, { key: "employee", label: "Employee" }, { key: "department", label: "Department" }, { key: "joined", label: "Joined" },
        { key: "lastTraining", label: "Last security training" }, { key: "policyAck", label: "Policy acknowledged" }, { key: "sensitiveAccess", label: "Sensitive access" }, { key: "backgroundCheck", label: "Background check" }],
      rows,
    },
  };
}

function backupReview(p: IndustryProfile, r: Rng, asOf: Date): Exercise {
  const options: Option[] = [OK,
    { value: "FAILED_NO_TICKET", label: "Failure not followed up", explain: "A failed or partial backup with no incident ticket means nobody fixed it." },
    { value: "RETENTION_SHORT", label: "Retention below policy", explain: "Backups are deleted sooner than the policy requires." },
    { value: "NO_RESTORE_TEST", label: "No restore test this quarter", explain: "An untested backup may not restore when it's needed." },
  ];
  const systems = [p.coreSystem.name, ...p.systems, "Email archive", "File server", "HR system", "Finance ERP", "Directory (AD)", "CRM"];
  const issues = ["FAILED_NO_TICKET", "FAILED_NO_TICKET", "FAILED_NO_TICKET", "RETENTION_SHORT", "RETENTION_SHORT", "NO_RESTORE_TEST", "NO_RESTORE_TEST"];
  const n = 26;
  const at = plant(r, n, issues);
  const answers: Record<string, string> = {};
  const rows = Array.from({ length: n }, (_, i) => {
    const issue = at.get(i) ?? "OK";
    const system = systems[i % systems.length];
    const policy = system === p.coreSystem.name ? 90 : r.pick([30, 35, 90]);
    let result = "Success";
    let ticket = "";
    let retention = policy + r.pick([0, 0, 5]);
    let restore = ago(asOf, r.int(5, 80));
    if (issue === "FAILED_NO_TICKET") result = r.pick(["Failed", "Partial"]);
    if (issue === "OK" && r.next() < 0.15) { result = "Failed"; ticket = `INC-${r.int(10000, 99999)}`; }
    if (issue === "RETENTION_SHORT") retention = Math.max(7, policy - r.pick([15, 23, 60]));
    if (issue === "NO_RESTORE_TEST") restore = ago(asOf, r.int(120, 260));
    const id = `B${String(i + 1).padStart(3, "0")}`;
    answers[id] = issue;
    return { id, date: ago(asOf, r.int(1, 30)), system, job: `${system.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-nightly`, result, ticket, retentionDays: String(retention), policyDays: String(policy), lastRestoreTest: restore };
  });
  return {
    kind: "backup_review", asOf: fmt(asOf), options, answers,
    notes: [`Today: ${fmt(asOf)}. A quarter is 90 days.`, "Every failed or partial job needs an incident ticket.", "Retention must be at least the policy's number of days."],
    table: {
      title: "Backup job report",
      columns: [{ key: "id", label: "#" }, { key: "date", label: "Run date" }, { key: "system", label: "System" }, { key: "job", label: "Job" }, { key: "result", label: "Result" },
        { key: "ticket", label: "Ticket" }, { key: "retentionDays", label: "Retention (days)" }, { key: "policyDays", label: "Policy (days)" }, { key: "lastRestoreTest", label: "Last restore test" }],
      rows,
    },
  };
}

const GENERATORS: Record<string, (p: IndustryProfile, r: Rng, asOf: Date) => Exercise> = {
  access_review: accessReview,
  asset_inventory: assetInventory,
  change_review: changeReview,
  vuln_triage: vulnTriage,
  firewall_review: firewallReview,
  vendor_review: vendorReview,
  training_review: trainingReview,
  backup_review: backupReview,
};

/** The learner's own data set: the same every time for one practice company, different for every company. */
export function buildExercise(kind: string, profile: IndustryProfile, orgId: string, orgCreatedAt: Date, taskKey: string): Exercise | null {
  const gen = GENERATORS[kind];
  if (!gen) return null;
  return gen(profile, rng(`${orgId}:${taskKey}`), new Date(Date.UTC(orgCreatedAt.getUTCFullYear(), orgCreatedAt.getUTCMonth(), orgCreatedAt.getUTCDate())));
}

/** What the learner sees: everything except the answer key. */
export function publicExercise(ex: Exercise) {
  const { answers: _answers, ...rest } = ex;
  return rest;
}

export type Grade = {
  passed: boolean;
  planted: number;
  found: number;
  wrongReason: number;
  falseAlarms: number;
  // Per issue type, how many were missed (without saying which rows).
  missedByType: { label: string; count: number }[];
};

// Passes when every planted problem is flagged (with the right reason) and at most two clean rows are flagged.
export function grade(ex: Exercise, flags: Record<string, string>): Grade {
  const label = new Map(ex.options.map((o) => [o.value, o.label]));
  let planted = 0, found = 0, wrongReason = 0, falseAlarms = 0;
  const missed = new Map<string, number>();
  for (const [row, truth] of Object.entries(ex.answers)) {
    const given = flags[row] ?? "OK";
    if (truth === "OK") { if (given !== "OK") falseAlarms++; continue; }
    planted++;
    if (given === truth) found++;
    else {
      if (given !== "OK") wrongReason++;
      missed.set(truth, (missed.get(truth) ?? 0) + 1);
    }
  }
  return {
    passed: found === planted && falseAlarms <= 2,
    planted, found, wrongReason, falseAlarms,
    missedByType: [...missed].map(([v, count]) => ({ label: label.get(v) ?? v, count })),
  };
}
