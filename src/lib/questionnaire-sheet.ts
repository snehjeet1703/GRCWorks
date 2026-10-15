import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { addDropdown, norm, readGrid, styleHeader, writeInstructions } from "@/lib/sheet";

// Spreadsheet template for vendor questionnaires: download, fill in questions, upload.

export type QuestionType = "TEXT" | "YES_NO" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "RATING" | "FILE_UPLOAD";
export type SheetQuestion = { id: string; text: string; type: QuestionType; required: boolean; options: string[]; category: string };

const TYPES: { label: string; value: QuestionType }[] = [
  { label: "Yes / No", value: "YES_NO" },
  { label: "Free text", value: "TEXT" },
  { label: "Single choice", value: "SINGLE_CHOICE" },
  { label: "Multiple choice", value: "MULTI_CHOICE" },
  { label: "Rating (1-5)", value: "RATING" },
  { label: "File upload", value: "FILE_UPLOAD" },
];
const TYPE_ALIASES: Record<string, QuestionType> = {
  ...Object.fromEntries(TYPES.flatMap((t) => [[norm(t.label), t.value], [norm(t.value), t.value]])),
  yesno: "YES_NO", boolean: "YES_NO", yn: "YES_NO", text: "TEXT", freetext: "TEXT", longtext: "TEXT", comment: "TEXT",
  single: "SINGLE_CHOICE", dropdown: "SINGLE_CHOICE", radio: "SINGLE_CHOICE", choice: "SINGLE_CHOICE",
  multi: "MULTI_CHOICE", multiple: "MULTI_CHOICE", checkbox: "MULTI_CHOICE", multiselect: "MULTI_CHOICE",
  rating: "RATING", scale: "RATING", rating15: "RATING", file: "FILE_UPLOAD", upload: "FILE_UPLOAD", attachment: "FILE_UPLOAD", evidence: "FILE_UPLOAD",
};

const CATEGORIES: { label: string; value: string }[] = [
  { label: "General", value: "GENERAL" },
  { label: "Security", value: "SECURITY" },
  { label: "Compliance", value: "COMPLIANCE" },
  { label: "Data privacy", value: "DATA_PRIVACY" },
  { label: "Business continuity", value: "BUSINESS_CONTINUITY" },
  { label: "Access control", value: "ACCESS_CONTROL" },
  { label: "Incident response", value: "INCIDENT_RESPONSE" },
];

const COLUMNS = [
  { key: "category", header: "Section", width: 22, note: "Groups related questions, e.g. Security. Pick from the list or type your own." },
  { key: "text", header: "Question *", width: 70, note: "The question the vendor answers." },
  { key: "type", header: "Answer Type *", width: 18, note: "How the vendor answers. Choice types need Options." },
  { key: "options", header: "Options", width: 40, note: "For Single/Multiple choice: the choices, separated by ; (e.g. SOC 2; ISO 27001; None)." },
  { key: "required", header: "Required", width: 11, note: "Yes or No. Blank means Yes." },
] as const;
type Key = (typeof COLUMNS)[number]["key"];
const HEADER_ALIASES: Record<Key, string[]> = {
  category: ["section", "category", "domain", "area", "topic"],
  text: ["question", "questiontext", "questions", "text"],
  type: ["answertype", "type", "responsetype", "questiontype", "format"],
  options: ["options", "choices", "answeroptions", "values"],
  required: ["required", "mandatory", "isrequired"],
};

const EXAMPLES: Omit<SheetQuestion, "id">[] = [
  { category: "SECURITY", text: "Does your organization have a documented information security policy?", type: "YES_NO", required: true, options: [] },
  { category: "COMPLIANCE", text: "Which certifications do you currently hold?", type: "MULTI_CHOICE", required: true, options: ["SOC 2 Type II", "ISO 27001", "PCI DSS", "HIPAA", "None"] },
  { category: "DATA_PRIVACY", text: "Describe how customer data is encrypted at rest and in transit.", type: "TEXT", required: true, options: [] },
  { category: "ACCESS_CONTROL", text: "How is access to production systems granted?", type: "SINGLE_CHOICE", required: true, options: ["Role-based (RBAC)", "Individual approval", "Shared accounts", "Other"] },
  { category: "INCIDENT_RESPONSE", text: "Rate the maturity of your incident response process.", type: "RATING", required: false, options: [] },
  { category: "SECURITY", text: "Upload your latest penetration test summary.", type: "FILE_UPLOAD", required: false, options: [] },
];

const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export async function buildQuestionnaireTemplate(organizationId: string, questionnaireId: string | null) {
  let questions: Omit<SheetQuestion, "id">[] = EXAMPLES;
  let title = "Vendor questionnaire";
  if (questionnaireId) {
    const q = await prisma.vendorQuestionnaire.findFirst({
      where: { id: questionnaireId, organizationId },
      select: { title: true, questions: true },
    });
    if (!q) throw new HttpError(404, "Questionnaire not found");
    title = q.title;
    questions = (Array.isArray(q.questions) ? q.questions : []) as unknown as SheetQuestion[];
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "GRC Platform";
  const ws = wb.addWorksheet("Questions", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeader(ws, COLUMNS.map((c) => c.note));
  for (const q of questions) {
    ws.addRow({
      category: categoryLabel(q.category || "GENERAL"),
      text: q.text,
      type: typeLabel(q.type),
      options: (q.options ?? []).join("; "),
      required: q.required === false ? "No" : "Yes",
    });
  }
  const rows = Math.max(questions.length + 300, 500);
  addDropdown(ws, 3, TYPES.map((t) => t.label), rows, "Answer type");
  addDropdown(ws, 5, ["Yes", "No"], rows, "Required");
  // Section suggests the standard list but accepts custom sections too.
  for (let r = 2; r <= rows + 1; r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`"${CATEGORIES.map((c) => c.label).join(",")}"`] };
  }
  ws.eachRow((row) => { row.alignment = { ...row.alignment, vertical: "top", wrapText: true }; });

  writeInstructions(wb, [
    `${title}: question sheet`,
    "",
    "1. Add one question per row on the 'Questions' sheet. Columns marked * are required.",
    questionnaireId
      ? "2. The rows already filled in are this questionnaire's current questions."
      : "2. The rows already filled in are examples. Edit or delete them.",
    "3. Answer Type: Yes / No, Free text, Single choice, Multiple choice, Rating (1-5) or File upload.",
    "4. Options are only for Single choice and Multiple choice: list at least two, separated by ';'.",
    "5. Required: Yes or No (blank means Yes). Section groups questions for the vendor; use the list or your own names.",
    "6. Keep the header row as it is. Save as .xlsx (or CSV) and upload it on the Questionnaires page.",
    "",
    "Nothing is saved until you review the preview.",
  ]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, fileName: `${title.replace(/[^\w.-]+/g, "_")}_questions.xlsx` };
}

const MAX_QUESTIONS = 500;

export async function parseQuestionnaireSheet(file: File) {
  const grid = await readGrid(file, "Questions", COLUMNS.length);
  const headerIdx = grid.findIndex((r) => r.some((h) => HEADER_ALIASES.text.includes(norm(h.replace(/\*/g, "")))));
  if (headerIdx === -1) throw new HttpError(400, "Couldn't find the header row. Use the template and keep its first row (Section, Question, Answer Type, …).");
  const header = grid[headerIdx].map((h) => norm(h.replace(/\*/g, "")));
  const col = {} as Record<Key, number>;
  for (const c of COLUMNS) col[c.key] = header.findIndex((h) => HEADER_ALIASES[c.key].includes(h));
  const get = (r: string[], k: Key) => (col[k] === -1 ? "" : (r[col[k]] ?? "").trim());

  const questions: SheetQuestion[] = [];
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];
  const seen = new Map<string, number>();

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (r.every((v) => !v?.trim())) continue;
    const rowNo = i + 1;
    if (questions.length >= MAX_QUESTIONS) { errors.push({ row: rowNo, message: `A questionnaire can have at most ${MAX_QUESTIONS} questions.` }); break; }

    const text = get(r, "text");
    const typeRaw = get(r, "type");
    const type = typeRaw ? TYPE_ALIASES[norm(typeRaw)] : col.type === -1 ? "TEXT" : undefined;
    const reqRaw = norm(get(r, "required"));
    const required = !reqRaw || ["yes", "y", "true", "1", "required", "mandatory"].includes(reqRaw)
      ? true
      : ["no", "n", "false", "0", "optional"].includes(reqRaw) ? false : null;
    const options = [...new Set(get(r, "options").split(/[;|\n]+/).map((o) => o.trim()).filter(Boolean))];
    const catRaw = get(r, "category");
    const category = CATEGORIES.find((c) => norm(c.label) === norm(catRaw) || norm(c.value) === norm(catRaw))?.value ?? catRaw.slice(0, 200);

    const problems: string[] = [];
    if (!text) problems.push("the question is empty");
    else if (text.length > 1000) problems.push("the question is longer than 1000 characters");
    if (!typeRaw && col.type !== -1) problems.push("Answer Type is empty");
    else if (!type) problems.push(`"${typeRaw}" isn't an answer type (use ${TYPES.map((t) => t.label).join(", ")})`);
    if ((type === "SINGLE_CHOICE" || type === "MULTI_CHOICE") && options.length < 2) problems.push(`${typeLabel(type)} needs at least two options`);
    if (required === null) problems.push(`Required should be Yes or No, not "${get(r, "required")}"`);
    if (problems.length) { errors.push({ row: rowNo, message: problems.join("; ") }); continue; }

    if (options.length && type !== "SINGLE_CHOICE" && type !== "MULTI_CHOICE") {
      warnings.push({ row: rowNo, message: `options are ignored for ${typeLabel(type!)} questions` });
    }
    const key = norm(text);
    if (seen.has(key)) warnings.push({ row: rowNo, message: `same question as row ${seen.get(key)}` });
    else seen.set(key, rowNo);

    questions.push({
      id: `q_${Date.now().toString(36)}_${i}`,
      text, type: type!, required: required!, category,
      options: type === "SINGLE_CHOICE" || type === "MULTI_CHOICE" ? options : [],
    });
  }
  return { questions, errors, warnings };
}
