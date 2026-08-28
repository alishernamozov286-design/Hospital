/**
 * CSV generation for the export endpoints.
 *
 * Two details make the difference between a file Excel opens correctly and one
 * the accountant emails back saying it is broken:
 *
 *  - A UTF-8 BOM. Without it Excel on Windows reads the file in the system
 *    codepage and every "o'" and "ʻ" turns to mojibake.
 *  - CRLF line endings, which is what the CSV spec says and what Excel expects.
 */

/**
 * Quotes a single field. A value is wrapped only when it has to be, which keeps
 * the file readable in a text editor.
 *
 * The leading apostrophe on +998… is deliberate: Excel otherwise treats a
 * leading "+" as a formula and shows #NAME?. It is stripped again on the way
 * back in, and any value that looks like a formula is defused the same way,
 * which also closes off CSV injection into the accountant's spreadsheet.
 */
function field(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;

  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(field).join(","), ...rows.map((r) => r.map(field).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Sets the headers that make a browser download the body as a named file. */
export function csvHeaders(res: { setHeader(k: string, v: string): void }, filename: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // The export is a snapshot of live data; a cached copy would be misleading.
  res.setHeader("Cache-Control", "no-store");
}

/** "2026-08-07" — used to stamp export filenames. */
export function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
