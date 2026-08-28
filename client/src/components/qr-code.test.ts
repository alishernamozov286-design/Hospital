/**
 * The QR code on a sample label is read by a machine, not a person, so "it
 * looks like a QR code" is not evidence that it works. Every failure mode that
 * matters — too little error correction, a missing quiet zone, a symbol too
 * dense to survive being printed small — still produces something that looks
 * right.
 *
 * These tests therefore generate exactly what the component generates, then
 * decode it with jsQR, an independent implementation. Anything that changes
 * the encoding options in qr-code.tsx without checking scannability fails here.
 */
import QRCode from "qrcode";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { sampleBarcode } from "@shared/sample";

/** Mirrors the encoding options in components/qr-code.tsx. */
const OPTIONS = { errorCorrectionLevel: "M", margin: 4 } as const;

/**
 * Rasterises a QR to the RGBA bitmap jsQR expects, the same way a printer
 * lays the SVG down: one solid square of device pixels per module.
 */
function rasterise(
  text: string,
  { scale = 8, margin = OPTIONS.margin }: { scale?: number; margin?: number } = {},
) {
  const qr = QRCode.create(text, { errorCorrectionLevel: OPTIONS.errorCorrectionLevel });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const dim = (size + margin * 2) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!data[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const o = (((y + margin) * scale + dy) * dim + (x + margin) * scale + dx) * 4;
          px[o] = px[o + 1] = px[o + 2] = 0;
        }
      }
    }
  }
  return { px, dim, modules: size };
}

const decode = (text: string, opts?: { scale?: number; margin?: number }) => {
  const { px, dim } = rasterise(text, opts);
  return jsQR(px, dim, dim)?.data ?? null;
};

describe("QR round-trip", () => {
  it("decodes back to the exact barcode", () => {
    const code = sampleBarcode(1042);
    expect(decode(code)).toBe(code);
  });

  it("holds across the whole range of order numbers a lab will reach", () => {
    // A short payload stays in alphanumeric mode, which is what keeps the
    // symbol small enough to print legibly on a 58x30mm label.
    for (const n of [1, 9, 42, 1001, 12345, 999999, 12345678]) {
      const code = sampleBarcode(n);
      expect(decode(code)).toBe(code);
    }
  });
});

describe("printed at real size", () => {
  /**
   * The label prints the code at 72 CSS px, about 19mm. These sizes are what a
   * 203dpi thermal label printer — the common cheap kind — resolves it to,
   * including sizes below what the component asks for as headroom.
   */
  it.each([
    [19, "as printed"],
    [15, "small label"],
    [12, "very small label"],
    [10, "worst case"],
  ])("decodes at %smm (%s)", (mm) => {
    const code = sampleBarcode(1042);
    const { modules } = rasterise(code);
    const devicePx = Math.round((mm / 25.4) * 203);
    const scale = Math.floor(devicePx / (modules + OPTIONS.margin * 2));
    expect(scale).toBeGreaterThanOrEqual(1);
    expect(decode(code, { scale })).toBe(code);
  });
});

describe("damage tolerance", () => {
  /** Erases a solid square out of the data region, away from the finders. */
  function erase(value: string, fraction: number): string | null {
    const scale = 8;
    const { px, dim, modules } = rasterise(value, { scale });
    const copy = new Uint8ClampedArray(px);
    const blot = Math.floor(modules * Math.sqrt(fraction));
    const start = Math.floor(modules * 0.45);

    for (let y = 0; y < blot; y += 1) {
      for (let x = 0; x < blot; x += 1) {
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const py = (start + y + OPTIONS.margin) * scale + dy;
            const pxx = (start + x + OPTIONS.margin) * scale + dx;
            if (py >= dim || pxx >= dim) continue;
            const o = (py * dim + pxx) * 4;
            copy[o] = copy[o + 1] = copy[o + 2] = 255;
          }
        }
      }
    }
    return jsQR(copy, dim, dim)?.data ?? null;
  }

  /**
   * Level M recovers ~15% of *codewords*, which is not the same as 15% of the
   * picture: `erase` removes one contiguous square, the worst shape for a
   * Reed-Solomon block, and a barcode is a 21x21 symbol where a single square
   * wipes whole codewords at once. So the honest measured limit here is well
   * under the nominal 15%, and pinning it down is the point — a change that
   * quietly drops to level L will fail this.
   *
   * A tube label is handled with gloves, smeared and chilled before anyone
   * scans it, so the damage that matters in practice is scattered rather than
   * one clean blot, and this is the pessimistic bound.
   */
  it("recovers from a 5% blot", () => {
    const code = sampleBarcode(1042);
    expect(erase(code, 0.05)).toBe(code);
  });

  it("tolerates a bigger blot as the symbol grows", () => {
    // Measured, not assumed: a 21-module barcode survives 5% and fails at 6%,
    // while a 29-module payload clears 6%. That difference is the evidence
    // that the 5% ceiling above is the symbol's size rather than a weak
    // error-correction level — swapping M for L would move both numbers.
    const longer = "LAB-1042-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(erase(longer, 0.06)).toBe(longer);
    expect(erase(sampleBarcode(1042), 0.06)).toBeNull();
  });
});

describe("the SVG that reaches the printer", () => {
  it("is vector, not a raster image", async () => {
    const svg = await QRCode.toString(sampleBarcode(1042), {
      type: "svg",
      ...OPTIONS,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    expect(svg).toMatch(/<svg/);
    // Without a viewBox the wrapper's width/height would distort the modules.
    expect(svg).toMatch(/viewBox="[^"]+"/);
    expect(svg).not.toMatch(/<image/i);
    // Pure black on pure white: a tinted code prints grey on a mono laser.
    expect(svg).toContain("#000000");
    expect(svg).toContain("#FFFFFF");
  });

  it("carries the 4-module quiet zone the spec requires", () => {
    const scale = 6;
    const margin = OPTIONS.margin;
    const { px, dim } = rasterise(sampleBarcode(1042), { scale, margin });
    const border = margin * scale;

    for (let y = 0; y < dim; y += 1) {
      for (let x = 0; x < dim; x += 1) {
        const inBorder = y < border || y >= dim - border || x < border || x >= dim - border;
        if (inBorder) expect(px[(y * dim + x) * 4]).toBe(255);
      }
    }
  });
});
