import ExcelJS from "exceljs";
import type { ControlFrequency, ControlStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { SAFE_ID, addDropdown, norm, readGrid, styleHeader, writeInstructions } from "@/lib/sheet";

// Spreadsheet template for loading a year's controls into an audit period:
// the platform hands out the template, the team fills it in, and it comes back as an upload.

export const COLUMNS = [
  { key: "code", header: "Control ID", width: 14, required: true, note: "Unique ID, e.g. CC6.1-01. An existing ID updates that control." },
  { key: "title", header: "Control Name", width: 40, required: true, note: "Short name of the control." },
  { key: "description", header: "Control Description", width: 60, required: false, note: "What the control does and how it operates." },
  { key: "criteria", header: "Criteria / Requirement IDs", width: 24, required: true, note: "Framework criteria this control meets, separated by ; (e.g. CC6.1; CC6.2)." },
  { key: "owner", header: "Owner Email", width: 30, required: false, note: "Email of the person responsible. They must already be a user." },
  { key: "frequency", header: "Evidence Frequency", width: 18, required: true, note: "How often evidence is due during the audit period." },
  { key: "evidence", header: "Evidence Required", width: 50, required: false, note: "What evidence the owner should upload." },
  { key: "status", header: "Implementation Status", width: 20, required: false, note: "Leave blank to keep the current status (new controls start as Not started)." },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];

const FREQUENCIES: { label: string; value: ControlFrequency }[] = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Quarterly", value: "QUARTERLY" },
  { label: "Annually", value: "ANNUALLY" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Daily", value: "DAILY" },
  { label: "Continuous", value: "CONTINUOUS" },
  { label: "As needed", value: "AS_NEEDED" },
];
const STATUSES: { label: string; value: ControlStatus }[] = [
  { label: "Not started", value: "NOT_STARTED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Implemented", value: "IMPLEMENTED" },
  { label: "Not applicable", value: "NOT_APPLICABLE" },
];

const FREQ_ALIASES: Record<string, ControlFrequency> = {
  ...Object.fromEntries(FREQUENCIES.flatMap((f) => [[norm(f.label), f.value], [norm(f.value), f.value]])),
  annual: "ANNUALLY", yearly: "ANNUALLY", year: "ANNUALLY", month: "MONTHLY", quarter: "QUARTERLY",
  ongoing: "CONTINUOUS", adhoc: "AS_NEEDED", eventdriven: "AS_NEEDED", onetime: "ANNUALLY",
};
const STATUS_ALIASES: Record<string, ControlStatus> = {
  ...Object.fromEntries(STATUSES.flatMap((s) => [[norm(s.label), s.value], [norm(s.value), s.value]])),
  na: "NOT_APPLICABLE", done: "IMPLEMENTED", complete: "IMPLEMENTED", completed: "IMPLEMENTED", todo: "NOT_STARTED",
};

// Header aliases so a lightly edited template (or a similar sheet) still maps.
const HEADER_ALIASES: Record<ColumnKey, string[]> = {
  code: ["controlid", "controlcode", "id", "code", "controlno", "controlnumber", "ref"],
  title: ["controlname", "name", "title", "controltitle", "control"],
  description: ["controldescription", "description", "controlactivity", "details"],
  criteria: ["criteriarequirementids", "criteria", "requirement", "requirements", "requirementids", "tsc", "mapping", "frameworkcriteria", "criteriaids"],
  owner: ["owneremail", "owner", "controlowner", "email", "assignee"],
  frequency: ["evidencefrequency", "frequency", "testfrequency", "controlfrequency"],
  evidence: ["evidencerequired", "evidence", "evidencerequirements", "artifacts"],
  status: ["implementationstatus", "status", "controlstatus"],
};

export async function buildTemplate(organizationId: string, frameworkId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const framework = await prisma.framework.findFirst({
    where: { id: frameworkId, organizationId },
    select: {
      name: true,
      requirements: { select: { code: true, title: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
    },
  });
  if (!framework) throw new HttpError(404, "Framework not found");

  const controls = await prisma.control.findMany({
    where: { organizationId, mappings: { some: { requirement: { frameworkId } } } },
    select: {
      code: true, title: true, description: true, frequency: true, status: true, implementationNotes: true,
      owner: { select: { email: true } },
      mappings: { where: { requirement: { frameworkId } }, select: { requirement: { select: { code: true } } } },
    },
    orderBy: { code: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "GRCWorks";
  const ws = wb.addWorksheet("Controls", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
  styleHeader(ws, COLUMNS.map((c) => c.note));

  const label = <T extends string>(list: { label: string; value: T }[], v: T) => list.find((x) => x.value === v)?.label ?? "";
  for (const c of controls) {
    ws.addRow({
      code: c.code,
      title: c.title,
      description: c.description,
      criteria: c.mappings.map((m) => m.requirement.code).sort().join("; "),
      owner: c.owner?.email ?? "",
      frequency: label(FREQUENCIES, c.frequency),
      evidence: c.implementationNotes,
      status: label(STATUSES, c.status),
    });
  }

  // Dropdowns for the constrained columns, generous enough for rows the team adds.
  const lastRow = Math.max(controls.length + 200, 500);
  const freqCol = COLUMNS.findIndex((c) => c.key === "frequency") + 1;
  const statusCol = COLUMNS.findIndex((c) => c.key === "status") + 1;
  addDropdown(ws, freqCol, FREQUENCIES.map((f) => f.label), lastRow, "Evidence frequency");
  addDropdown(ws, statusCol, STATUSES.map((s) => s.label), lastRow, "Implementation status");
  ws.eachRow((row) => { row.alignment = { ...row.alignment, vertical: "top", wrapText: true }; });

  const ref = wb.addWorksheet("Criteria reference");
  ref.columns = [{ header: "Criteria ID", key: "code", width: 16 }, { header: "Title", key: "title", width: 80 }];
  ref.getRow(1).font = { bold: true };
  framework.requirements.forEach((r) => ref.addRow(r));

  writeInstructions(wb, [
    `${framework.name}: control sheet`,
    "",
    "1. Fill in one row per control on the 'Controls' sheet. Columns marked * are required.",
    "2. Rows already filled in are your current controls. Edit them as needed; a matching Control ID updates the existing control.",
    "3. Criteria: list the framework criteria each control meets, separated by ';'. See 'Criteria reference' for valid IDs.",
    "   IDs that aren't in the reference list are added to the framework when you import.",
    "4. Owner Email must belong to an existing user. Unknown emails leave the control unassigned (you'll see a warning first).",
    "5. Evidence Frequency decides how the audit period is split into evidence slots (Monthly = 12 per year, Quarterly = 4, Annually = 1).",
    "6. Don't rename or reorder the header row. Save as .xlsx (or CSV) and upload it on the Audits page.",
    "",
    "Nothing changes until you review the preview and click Import.",
  ]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const safe = framework.name.replace(/[^\w.-]+/g, "_");
  return { buffer, fileName: `${safe}_control_sheet.xlsx` };
}

// ─── Parsing ──────────────────────────────────────────────────

export type SheetRow = {
  row: number;
  code: string; title: string; description: string; criteria: string[];
  owner: string; frequency: ControlFrequency | null; evidence: string; status: ControlStatus | null;
};
export type ParsedSheet = { rows: SheetRow[]; errors: { row: number; message: string }[]; missingColumns: string[] };

const MAX_ROWS = 2000;

export async function parseSheet(file: File): Promise<ParsedSheet> {
  const grid = await readGrid(file, "Controls", COLUMNS.length);

  // The header row is the first row that names a Control ID column (allows a title row above it).
  const headerIdx = grid.findIndex((r) => r.some((h) => HEADER_ALIASES.code.includes(norm(h.replace(/\*/g, "")))));
  if (headerIdx === -1) throw new HttpError(400, "Couldn't find the header row. Use the template and keep its first row (Control ID, Control Name, …).");
  const header = grid[headerIdx].map((h) => norm(h.replace(/\*/g, "")));
  const colOf = {} as Record<ColumnKey, number>;
  for (const c of COLUMNS) colOf[c.key] = header.findIndex((h) => HEADER_ALIASES[c.key].includes(h));
  const missingColumns = COLUMNS.filter((c) => c.required && colOf[c.key] === -1).map((c) => c.header);

  const rows: SheetRow[] = [];
  const errors: ParsedSheet["errors"] = [];
  const seen = new Map<string, number>();
  const get = (r: string[], k: ColumnKey) => (colOf[k] === -1 ? "" : (r[colOf[k]] ?? "").trim());

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (r.every((v) => !v?.trim())) continue;
    const rowNo = i + 1;
    if (rows.length >= MAX_ROWS) { errors.push({ row: rowNo, message: `Only the first ${MAX_ROWS} controls are imported.` }); break; }

    const code = get(r, "code");
    const title = get(r, "title");
    const freqRaw = get(r, "frequency");
    const statusRaw = get(r, "status");
    const frequency = freqRaw ? FREQ_ALIASES[norm(freqRaw)] ?? null : null;
    const status = statusRaw ? STATUS_ALIASES[norm(statusRaw)] ?? null : null;
    const criteria = [...new Set(get(r, "criteria").split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean))];

    const problems: string[] = [];
    if (!code) problems.push("Control ID is empty");
    else if (!SAFE_ID.test(code)) problems.push("Control ID must be up to 50 letters, digits or simple punctuation (- . _ / : ( )), starting with a letter or digit");
    if (!title) problems.push("Control Name is empty");
    if (criteria.length === 0) problems.push("no criteria given");
    else if (criteria.length > 30) problems.push("more than 30 criteria in one row");
    const badCriteria = criteria.filter((c) => !SAFE_ID.test(c));
    if (badCriteria.length) problems.push(`criteria IDs must be up to 50 letters, digits or simple punctuation: ${badCriteria.slice(0, 3).map((c) => `"${c.slice(0, 20)}"`).join(", ")}`);
    if (get(r, "owner").length > 254) problems.push("Owner Email is too long");
    if (!freqRaw) problems.push("Evidence Frequency is empty");
    else if (!frequency) problems.push(`"${freqRaw}" isn't a frequency (use ${FREQUENCIES.map((f) => f.label).join(", ")})`);
    if (statusRaw && !status) problems.push(`"${statusRaw}" isn't a status (use ${STATUSES.map((s) => s.label).join(", ")})`);
    if (code && seen.has(code.toLowerCase())) problems.push(`Control ID ${code} is also used on row ${seen.get(code.toLowerCase())}`);
    if (code) seen.set(code.toLowerCase(), rowNo);

    if (problems.length) { errors.push({ row: rowNo, message: problems.join("; ") }); continue; }
    rows.push({
      row: rowNo, code, title: title.slice(0, 300), description: get(r, "description").slice(0, 5000), criteria,
      owner: get(r, "owner").toLowerCase(), frequency, evidence: get(r, "evidence").slice(0, 5000), status,
    });
  }
  return { rows, errors, missingColumns };
}

export const frequencyLabel = (f: ControlFrequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;
