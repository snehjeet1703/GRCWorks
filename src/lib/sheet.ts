import ExcelJS from "exceljs";
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { HttpError } from "@/lib/api";

// Shared reading of uploaded spreadsheets (.xlsx or .csv) as a grid of trimmed strings.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** IDs (control IDs, criteria) stay plain: letters, digits and simple punctuation, not starting like a formula. */
export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9 ._:()\/&#-]{0,49}$/;

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    if ("result" in v) return cellText((v as { result: ExcelJS.CellValue }).result);
    return "";
  }
  return String(v);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

// Limits for uploaded sheets. An .xlsx is a zip, so its unpacked size is checked before parsing
// (a small "zip bomb" could otherwise expand to gigabytes in memory).
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 300;
const MAX_COLUMNS = 40;
const MAX_GRID_ROWS = 5000;

function assertSafeXlsx(bytes: Uint8Array) {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    throw new HttpError(400, "That file isn't a valid .xlsx workbook. Save it from Excel as .xlsx (or CSV) and try again.");
  }
  let total = 0, entries = 0, tooBig = false;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  unzip.onfile = (f) => {
    if (++entries > MAX_ZIP_ENTRIES || tooBig) { tooBig = true; return; }
    f.ondata = (err, chunk) => {
      if (err || tooBig) { tooBig = tooBig || !!err; return; }
      total += chunk.length;
      if (total > MAX_UNZIPPED_BYTES) { tooBig = true; f.terminate(); }
    };
    f.start();
  };
  try {
    unzip.push(bytes, true);
  } catch {
    throw new HttpError(400, "That file couldn't be read as an Excel workbook. Save it as .xlsx and try again.");
  }
  if (tooBig) throw new HttpError(400, "That workbook is too large or complex to import. Keep only the sheet with your data and try again.");
}

/** Reads the named sheet (or the first one) of an .xlsx, or a .csv, into rows of cell strings. */
export async function readGrid(file: File, preferredSheet: string, minColumns: number): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".csv")) {
    if (bytes.includes(0)) throw new HttpError(400, "That file isn't a text CSV. Save it as CSV (UTF-8) or .xlsx and try again.");
    const grid = parseCsv(new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, ""));
    if (grid.length > MAX_GRID_ROWS) throw new HttpError(400, `The sheet has more than ${MAX_GRID_ROWS} rows.`);
    return grid.map((r) => r.slice(0, MAX_COLUMNS));
  }
  if (!name.endsWith(".xlsx")) {
    throw new HttpError(400, "Upload the sheet as .xlsx or .csv. Older .xls files need saving as .xlsx first.");
  }
  assertSafeXlsx(bytes);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, "That file couldn't be read as an Excel workbook. Save it as .xlsx and try again.");
  }
  const ws = wb.getWorksheet(preferredSheet) ?? wb.worksheets[0];
  if (!ws) throw new HttpError(400, "The workbook has no sheets.");
  if (ws.actualRowCount > MAX_GRID_ROWS) throw new HttpError(400, `The sheet has more than ${MAX_GRID_ROWS} rows.`);
  const columns = Math.min(Math.max(ws.columnCount, minColumns), MAX_COLUMNS);
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n > MAX_GRID_ROWS + 50) return;
    const values: string[] = [];
    for (let c = 1; c <= columns; c++) values.push(cellText(row.getCell(c).value).trim());
    grid[n - 1] = values;
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}

/** Styles a template's header row: dark, bold, with a hint on each column. */
export function styleHeader(ws: ExcelJS.Worksheet, notes: string[]) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  notes.forEach((n, i) => { head.getCell(i + 1).note = n; });
}

/** Adds a dropdown to a column for the first `rows` data rows. */
export function addDropdown(ws: ExcelJS.Worksheet, col: number, values: string[], rows: number, title: string) {
  for (let r = 2; r <= rows + 1; r++) {
    ws.getCell(r, col).dataValidation = {
      type: "list", allowBlank: true, showErrorMessage: true,
      formulae: [`"${values.join(",")}"`], errorTitle: title, error: "Pick a value from the list.",
    };
  }
}

export function writeInstructions(wb: ExcelJS.Workbook, lines: string[]) {
  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 110;
  lines.forEach((line, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
}
