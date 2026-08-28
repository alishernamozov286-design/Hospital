/**
 * Excel (.xlsx) and PDF export for every list screen.
 *
 * One column definition drives both formats, so a column can never appear in
 * the spreadsheet but go missing from the printout. A caller describes its
 * table once:
 *
 *   exportExcel({ filename: "bemorlar", title: "Bemorlar", columns, rows })
 *   exportPdf({ filename: "bemorlar", title: "Bemorlar", columns, rows })
 *
 * Both libraries are pulled in through dynamic import(). Together with the
 * embedded font they are well over a megabyte, and a receptionist who never
 * touches the export button should not pay for them on every page load.
 */

import type { ColumnAlign, ExportColumn, ExportDoc, ExportSection } from "./export-types";

export type { ColumnAlign, ExportColumn, ExportDoc, ExportSection };

// ------------------------------------------------------------------ helpers

/**
 * Strips the two characters our embedded Roboto subset has no glyph for.
 *
 * U+02BB is the official apostrophe of the Latin Uzbek alphabet ("oʻzbek"), so
 * it genuinely turns up in names typed from a phone keyboard; the arrows come
 * from the result flags. Without this they render as blank boxes, which looks
 * like data loss on a document a patient takes home.
 *
 * Exported for the test that pins the substitution list to the font's actual
 * coverage — see export.test.ts.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/[ʻʼ‘’]/g, "'")
    .replace(/↑/g, " (yuqori)")
    .replace(/↓/g, " (past)")
    .replace(/ | /g, " ");
}

/** A cell's display text. Numbers keep their raw value for Excel elsewhere. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}

/** "bemorlar" -> "bemorlar-2026-08-08". Stamped so files never overwrite. */
function stampedName(base: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Safari; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------------- excel

/**
 * A real .xlsx workbook — not a CSV with a spreadsheet extension.
 *
 * Money and counts are written as numbers with a display format rather than as
 * pre-formatted strings, so the accountant can sum a column instead of
 * re-typing it. The header rows are frozen for the same reason.
 */
export async function exportExcel<T>(doc: ExportDoc<T>): Promise<void> {
  const XLSX = await import("xlsx");

  const { columns, rows, title, subtitle, filename, sheetName, sections } = doc;

  // Row 1 is the title, row 2 the subtitle/filter description, row 3 blank,
  // row 4 the header — a layout that survives being printed as-is.
  //
  // The header is written even for an empty table: a document whose only
  // content is its sections (the dashboard before the day's first order) still
  // reads better with the column names present than with a hole where they go.
  const aoa: unknown[][] = [];
  aoa.push([title]);
  aoa.push([subtitle ?? ""]);
  aoa.push([]);
  aoa.push(columns.map((c) => c.header));

  for (const row of rows) {
    aoa.push(
      columns.map((c) => {
        const value = c.value(row);
        // Numeric columns stay numeric so SUM() works in the spreadsheet.
        if (c.type === "money" || c.type === "number") {
          const n = typeof value === "number" ? value : Number(value);
          return Number.isFinite(n) ? n : null;
        }
        return cellText(value);
      }),
    );
  }

  // A totals row for every money/number column that asked for one.
  const wantsTotals = columns.some((c) => c.total);
  if (wantsTotals && rows.length > 0) {
    aoa.push([]);
    aoa.push(
      columns.map((c, i) => {
        if (i === 0) return "JAMI";
        if (!c.total) return "";
        let sum = 0;
        for (const row of rows) {
          const v = c.value(row);
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) sum += n;
        }
        return sum;
      }),
    );
  }

  const headerRow = 3; // zero-based index of the header row
  const firstDataRow = headerRow + 1;
  // The main table ends before any appended sections, so the autofilter and
  // the money formatting below must not run past it.
  const lastRow = aoa.length - 1;

  /** Row ranges of appended sections, so their numbers get formatted too. */
  const sectionNumberCells: { row: number; col: number; money: boolean }[] = [];

  for (const section of sections ?? []) {
    aoa.push([]);
    aoa.push([section.title]);
    aoa.push(section.columns.map((c) => c.header));
    for (const row of section.rows) {
      const rowIndex = aoa.length;
      aoa.push(
        row.map((cell, i) => {
          const type = section.columns[i]?.type;
          if (type === "money" || type === "number") {
            const n = typeof cell === "number" ? cell : Number(cell);
            if (Number.isFinite(n)) {
              sectionNumberCells.push({ row: rowIndex, col: i, money: type === "money" });
              return n;
            }
            return null;
          }
          return cellText(cell);
        }),
      );
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths, and the number format that makes 1250000 read as 1 250 000.
  // A section may be wider than the main table, so the widest wins per column.
  const widths = columns.map((c) => c.width ?? 16);
  for (const section of sections ?? []) {
    section.columns.forEach((c, i) => {
      const w = c.width ?? 16;
      if (i >= widths.length) widths.push(w);
      else if (w > widths[i]) widths[i] = w;
    });
  }
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!freeze"] = { xSplit: 0, ySplit: firstDataRow };
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: lastRow, c: columns.length - 1 },
    }),
  };

  for (let r = firstDataRow; r <= lastRow; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
      const col = columns[c];
      if (col.type !== "money" && col.type !== "number") continue;
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref];
      if (!cell || typeof cell.v !== "number") continue;
      // "#,##0" with a space group separator matches how the app prints money.
      cell.z = col.type === "money" ? "#\\ ##0" : "0";
    }
  }

  for (const { row, col, money: isMoney } of sectionNumberCells) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
    if (cell && typeof cell.v === "number") cell.z = isMoney ? "#\\ ##0" : "0";
  }

  // Merge the title across the table so it reads as a heading.
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, columns.length - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, columns.length - 1) } },
  ];

  const book = XLSX.utils.book_new();
  // Excel rejects sheet names over 31 chars or containing []:*?/\
  const safeSheet = (sheetName ?? title).replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Hisobot";
  XLSX.utils.book_append_sheet(book, sheet, safeSheet);

  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  triggerDownload(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${stampedName(filename)}.xlsx`,
  );
}

// --------------------------------------------------------------------- pdf

/**
 * A landscape-or-portrait PDF with a branded header, a striped table and a
 * page footer. Orientation follows the column count: anything past six columns
 * is unreadable on A4 portrait.
 */
export async function exportPdf<T>(doc: ExportDoc<T>): Promise<void> {
  const [{ jsPDF }, autoTableModule, font] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    import("./pdf-font"),
  ]);
  const autoTable = autoTableModule.default;

  const { columns, rows, title, subtitle, filename, orientation, sections } = doc;

  const landscape = orientation ? orientation === "landscape" : columns.length > 6;
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  // Register the Unicode font under both weights before anything is drawn.
  pdf.addFileToVFS("Roboto-Regular.ttf", font.ROBOTO_REGULAR_BASE64);
  pdf.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  pdf.addFileToVFS("Roboto-Bold.ttf", font.ROBOTO_BOLD_BASE64);
  pdf.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  pdf.setFont("Roboto", "normal");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 32;

  const body = rows.map((row) =>
    columns.map((c) => {
      const raw = c.value(row);
      const text = c.type === "money" && typeof raw === "number"
        ? formatMoneyPlain(raw)
        : cellText(raw);
      return pdfSafe(text);
    }),
  );

  // Totals row, matching the spreadsheet's.
  const wantsTotals = columns.some((c) => c.total);
  const foot: string[][] = [];
  if (wantsTotals && rows.length > 0) {
    foot.push(
      columns.map((c, i) => {
        if (i === 0) return "JAMI";
        if (!c.total) return "";
        let sum = 0;
        for (const row of rows) {
          const v = c.value(row);
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) sum += n;
        }
        return pdfSafe(formatMoneyPlain(sum));
      }),
    );
  }

  autoTable(pdf, {
    head: [columns.map((c) => pdfSafe(c.header))],
    body,
    foot: foot.length ? foot : undefined,
    startY: margin + 54,
    margin: { left: margin, right: margin, bottom: margin + 18 },
    styles: {
      font: "Roboto",
      fontSize: 8.5,
      cellPadding: 5,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      textColor: [15, 23, 42],
      overflow: "linebreak",
    },
    headStyles: {
      font: "Roboto",
      fontStyle: "bold",
      fillColor: [15, 118, 178],
      textColor: [255, 255, 255],
      fontSize: 8.5,
    },
    footStyles: {
      font: "Roboto",
      fontStyle: "bold",
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [
        i,
        {
          halign: c.align ?? (c.type === "money" || c.type === "number" ? "right" : "left"),
          cellWidth: c.pdfWidth ?? "auto",
        },
      ]),
    ),
    didDrawPage: () => {
      // Header band, redrawn on every page so a loose sheet is identifiable.
      pdf.setFillColor(15, 118, 178);
      pdf.rect(0, 0, pageWidth, 4, "F");

      pdf.setFont("Roboto", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(15, 23, 42);
      pdf.text(pdfSafe(title), margin, margin + 14);

      if (subtitle) {
        pdf.setFont("Roboto", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text(pdfSafe(subtitle), margin, margin + 30);
      }

      const pageHeight = pdf.internal.pageSize.getHeight();
      const page = pdf.getNumberOfPages();
      pdf.setFont("Roboto", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(pdfSafe(`${formatDateTimePlain(new Date())} · MedLab`), margin, pageHeight - 16);
      pdf.text(String(page), pageWidth - margin, pageHeight - 16, { align: "right" });
    },
  });

  // Appended tables — the revenue report's finance summary and breakdowns.
  for (const section of sections ?? []) {
    if (section.rows.length === 0) continue;

    // finalY is where the previous table ended; leave room for the heading.
    const previousEnd = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 54;
    const pageHeight = pdf.internal.pageSize.getHeight();
    let headingY = previousEnd + 28;

    // A heading stranded at the bottom of a page with its table overleaf reads
    // as a mistake, so push both to the next page together.
    if (headingY + 60 > pageHeight - margin) {
      pdf.addPage();
      headingY = margin + 54;
    }

    pdf.setFont("Roboto", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(pdfSafe(section.title), margin, headingY);

    autoTable(pdf, {
      head: [section.columns.map((c) => pdfSafe(c.header))],
      body: section.rows.map((row) =>
        row.map((cell, i) => {
          const type = section.columns[i]?.type;
          const text = type === "money" && typeof cell === "number"
            ? formatMoneyPlain(cell)
            : cellText(cell);
          return pdfSafe(text);
        }),
      ),
      startY: headingY + 8,
      margin: { left: margin, right: margin, bottom: margin + 18 },
      styles: {
        font: "Roboto",
        fontSize: 8.5,
        cellPadding: 5,
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        textColor: [15, 23, 42],
        overflow: "linebreak",
      },
      headStyles: {
        font: "Roboto",
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontSize: 8.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: Object.fromEntries(
        section.columns.map((c, i) => [
          i,
          { halign: c.align ?? (c.type === "money" || c.type === "number" ? "right" : "left") },
        ]),
      ),
    });
  }

  pdf.save(`${stampedName(filename)}.pdf`);
}

// ------------------------------------------------- plain formatters for pdf

/**
 * Money without the non-breaking spaces the UI uses: autoTable measures text
 * with the font's own metrics and a NBSP inside a right-aligned cell throws the
 * column width off.
 */
function formatMoneyPlain(value: number): string {
  const rounded = Math.round(value || 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatDateTimePlain(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
