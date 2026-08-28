/**
 * The export path's one genuinely fragile assumption is that every character
 * an Uzbek document can contain has a glyph in the embedded Roboto subset.
 * When that is false the PDF shows blank boxes rather than failing, so nobody
 * notices until a patient is handed the sheet.
 *
 * These tests read the actual font out of pdf-font.ts and check its cmap, so
 * swapping the font for a differently-subsetted one fails here rather than in
 * a printout.
 */
import { describe, expect, it } from "vitest";
import { pdfSafe } from "./export";
import { ROBOTO_BOLD_BASE64, ROBOTO_REGULAR_BASE64 } from "./pdf-font";

// ------------------------------------------------------- minimal cmap reader

/** Codepoint -> has a glyph, read from the font's format-4 Unicode cmap. */
function glyphChecker(base64: string): (cp: number) => boolean {
  const buf = Buffer.from(base64, "base64");

  let cmapOffset = 0;
  const tableCount = buf.readUInt16BE(4);
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    if (buf.toString("ascii", record, record + 4) === "cmap") {
      cmapOffset = buf.readUInt32BE(record + 8);
    }
  }
  if (!cmapOffset) throw new Error("font has no cmap table");

  let subtable = 0;
  const subtableCount = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtableCount; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(record);
    const encoding = buf.readUInt16BE(record + 2);
    const offset = buf.readUInt32BE(record + 4);
    // Windows Unicode BMP (3,1) or full repertoire (3,10), format 4.
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      if (buf.readUInt16BE(cmapOffset + offset) === 4) subtable = cmapOffset + offset;
    }
  }
  if (!subtable) throw new Error("font has no format-4 Unicode cmap");

  const segCountX2 = buf.readUInt16BE(subtable + 6);
  const endOffset = subtable + 14;
  const startOffset = endOffset + segCountX2 + 2;
  const deltaOffset = startOffset + segCountX2;
  const rangeOffset = deltaOffset + segCountX2;

  return (cp: number) => {
    for (let i = 0; i < segCountX2 / 2; i += 1) {
      if (cp > buf.readUInt16BE(endOffset + i * 2)) continue;
      const start = buf.readUInt16BE(startOffset + i * 2);
      if (cp < start) return false;
      const delta = buf.readInt16BE(deltaOffset + i * 2);
      const range = buf.readUInt16BE(rangeOffset + i * 2);
      if (range === 0) return ((cp + delta) & 0xffff) !== 0;
      const glyphIndex = rangeOffset + i * 2 + range + (cp - start) * 2;
      if (glyphIndex + 1 >= buf.length) return false;
      return buf.readUInt16BE(glyphIndex) !== 0;
    }
    return false;
  };
}

const hasRegular = glyphChecker(ROBOTO_REGULAR_BASE64);
const hasBold = glyphChecker(ROBOTO_BOLD_BASE64);

// ------------------------------------------------------------------- tests

describe("pdfSafe", () => {
  it("replaces the Uzbek turned comma the font has no glyph for", () => {
    expect(pdfSafe("Oʻtkir Gʻaniyev")).toBe("O'tkir G'aniyev");
  });

  it("normalises the curly quotes a phone keyboard produces", () => {
    expect(pdfSafe("O‘tkir")).toBe("O'tkir");
    expect(pdfSafe("O’tkir")).toBe("O'tkir");
    expect(pdfSafe("Oʼtkir")).toBe("O'tkir");
  });

  it("spells out the result-flag arrows as words", () => {
    expect(pdfSafe("12.5 ↑")).toBe("12.5  (yuqori)");
    expect(pdfSafe("3.1 ↓")).toBe("3.1  (past)");
  });

  it("flattens the non-breaking spaces money and phones are formatted with", () => {
    //   keeps "1 250 000 so'm" from wrapping on screen, but autoTable
    // measures it as a glyph and mis-sizes the column.
    expect(pdfSafe("1 250 000 so'm")).toBe("1 250 000 so'm");
    expect(pdfSafe("+998 90 123")).toBe("+998 90 123");
  });

  it("leaves ordinary Latin and Cyrillic untouched", () => {
    expect(pdfSafe("Тошматов Шухрат")).toBe("Тошматов Шухрат");
    expect(pdfSafe("Aliyev A.")).toBe("Aliyev A.");
  });
});

describe("embedded font coverage", () => {
  /**
   * Every character the app can put into a PDF cell. If one of these is ever
   * missing from the font, pdfSafe needs a new substitution — a blank box in
   * a patient's name is not an acceptable failure mode.
   */
  const required = [
    ["latin lowercase", "abcdefghijklmnopqrstuvwxyz"],
    ["latin uppercase", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["digits", "0123456789"],
    ["ascii punctuation", "'\".,:;!?()[]{}+-*/=%#@&_<>|~^$"],
    ["uzbek cyrillic", "ўғқҳЎҒҚҲ"],
    ["russian cyrillic", "абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"],
    ["typography used by the formatters", "№−—·°"],
  ] as const;

  for (const [label, chars] of required) {
    it(`covers ${label} in both weights`, () => {
      const missingRegular = [...chars].filter((c) => !hasRegular(c.codePointAt(0)!));
      const missingBold = [...chars].filter((c) => !hasBold(c.codePointAt(0)!));
      expect({ regular: missingRegular, bold: missingBold }).toEqual({ regular: [], bold: [] });
    });
  }

  it("covers everything pdfSafe can emit", () => {
    // The substitutions are only useful if their *output* is renderable.
    const output = pdfSafe("Oʻ Gʻ O‘ O’ 12↑ 3↓ 1 250");
    const missing = [...output].filter((c) => !hasRegular(c.codePointAt(0)!));
    expect(missing).toEqual([]);
  });

  it("still lacks the glyphs pdfSafe exists to work around", () => {
    // If a future font subset gains these, pdfSafe's replacements become
    // lossy for no reason and should be dropped.
    expect(hasRegular(0x02bb)).toBe(false); // ʻ
    expect(hasRegular(0x2191)).toBe(false); // ↑
    expect(hasRegular(0x2193)).toBe(false); // ↓
  });
});
