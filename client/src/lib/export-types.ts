/**
 * The shape a screen describes its table in, shared by the Excel and the PDF
 * writer.
 *
 * Kept in its own module so a page can import the types without dragging in
 * export.ts — which is the file that dynamically pulls ~1 MB of xlsx/jspdf.
 */

export type ColumnAlign = "left" | "center" | "right";

export type ExportColumn<T = never> = {
  header: string;
  /**
   * Pulls the cell's value out of a row. Returning a number (rather than a
   * pre-formatted string) is what lets the spreadsheet keep it summable.
   */
  value: (row: T) => unknown;
  /** "money" and "number" stay numeric in Excel and right-align in the PDF. */
  type?: "text" | "number" | "money";
  align?: ColumnAlign;
  /** Excel column width, in characters. */
  width?: number;
  /** PDF column width in points; "auto" by default. */
  pdfWidth?: number;
  /** Include this column in the JAMI (totals) row. */
  total?: boolean;
};

export type ExportDoc<T = never> = {
  /** Base filename, without extension or date — "bemorlar". */
  filename: string;
  /** Document heading, also the Excel sheet name unless sheetName is given. */
  title: string;
  /** The filter/date-range line under the heading. */
  subtitle?: string;
  sheetName?: string;
  orientation?: "portrait" | "landscape";
  columns: ExportColumn<T>[];
  rows: T[];
  /**
   * Extra tables appended after the main one — the revenue report's finance
   * summary, expense breakdown and referrer list. They are written below the
   * main table in Excel and onto following pages in the PDF, so a report that
   * is really several small tables does not need several files.
   */
  sections?: ExportSection[];
};

/** A secondary table: its own heading, its own columns, plain string cells. */
export type ExportSection = {
  title: string;
  columns: { header: string; align?: ColumnAlign; width?: number; type?: "text" | "number" | "money" }[];
  /** Cells are given raw; numbers stay summable in Excel just like the main table. */
  rows: unknown[][];
};
