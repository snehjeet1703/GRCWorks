import ExcelJS from "exceljs";
import { HttpError } from "@/lib/api";

// Shared reading of uploaded spreadsheets (.xlsx or .csv) as a grid of trimmed strings.

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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

/** Reads the named sheet (or the first one) of an .xlsx, or a .csv, into rows of cell strings. */
export async function readGrid(file: File, preferredSheet: string, minColumns: number): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv((await file.text()).replace(/^﻿/, ""));
  if (!name.endsWith(".xlsx")) {
    throw new HttpError(400, "Upload the sheet as .xlsx or .csv. Older .xls files need saving as .xlsx first.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, "That file couldn't be read as an Excel workbook. Save it as .xlsx and try again.");
  }
  const ws = wb.getWorksheet(preferredSheet) ?? wb.worksheets[0];
  if (!ws) throw new HttpError(400, "The workbook has no sheets.");
  const grid: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values: string[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, minColumns); c++) values.push(cellText(row.getCell(c).value).trim());
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
