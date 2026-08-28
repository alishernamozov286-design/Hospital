/**
 * The sample rules are the one place where a wrong answer costs a patient a
 * second needle, so the awkward cases are pinned down here rather than left to
 * whatever the UI happens to call:
 *
 *  - a barcode survives the round trip through a scanner wedge;
 *  - a rejected tube is genuinely terminal;
 *  - a correction (one step back) stays possible while the tube is live.
 */
import { describe, expect, it } from "vitest";
import {
  BARCODE_PREFIX,
  canTransition,
  nextStatuses,
  parseBarcode,
  resultsNeedWarning,
  resultsWarning,
  sampleBarcode,
} from "./sample";
import { SAMPLE_STATUSES, type Sample, type SampleStatus } from "./schema";

const sampleWith = (status: SampleStatus): Sample =>
  ({ id: "s1", orderId: "o1", barcode: "LAB-1042", status }) as Sample;

describe("sampleBarcode / parseBarcode", () => {
  it("round-trips an order number", () => {
    expect(parseBarcode(sampleBarcode(1042))).toBe(1042);
  });

  it("uses the documented prefix", () => {
    expect(sampleBarcode(7)).toBe(`${BARCODE_PREFIX}-7`);
  });

  it("accepts what a scanner wedge actually emits", () => {
    // Trailing whitespace and case are what a barcode reader adds on its own.
    expect(parseBarcode("  lab-1042 \n")).toBe(1042);
    expect(parseBarcode("LAB 1042")).toBe(1042);
    expect(parseBarcode("LAB1042")).toBe(1042);
  });

  it("accepts a bare number, which is what people type", () => {
    expect(parseBarcode("1042")).toBe(1042);
  });

  it("rejects anything else rather than guessing", () => {
    for (const bad of ["", "   ", "LAB-", "ABC-1042", "LAB-12x", "LAB-0", "-5", null, undefined]) {
      expect(parseBarcode(bad)).toBeNull();
    }
  });
});

describe("canTransition", () => {
  it("walks the normal path", () => {
    expect(canTransition("kutilmoqda", "olindi")).toBe(true);
    expect(canTransition("olindi", "qabul_qilindi")).toBe(true);
  });

  it("allows rejection from every live state", () => {
    expect(canTransition("kutilmoqda", "rad_etildi")).toBe(true);
    expect(canTransition("olindi", "rad_etildi")).toBe(true);
    // Haemolysis is often only noticed after the tube was accepted.
    expect(canTransition("qabul_qilindi", "rad_etildi")).toBe(true);
  });

  it("keeps rejection terminal", () => {
    for (const to of SAMPLE_STATUSES) {
      expect(canTransition("rad_etildi", to)).toBe(false);
    }
    expect(nextStatuses("rad_etildi")).toHaveLength(0);
  });

  it("allows one step back, so a mis-click is fixable", () => {
    expect(canTransition("olindi", "kutilmoqda")).toBe(true);
    expect(canTransition("qabul_qilindi", "olindi")).toBe(true);
  });

  it("refuses skipping the laboratory's own hand-off", () => {
    expect(canTransition("kutilmoqda", "qabul_qilindi")).toBe(false);
  });

  it("treats a no-op as not a transition", () => {
    for (const s of SAMPLE_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe("resultsNeedWarning", () => {
  it("stays silent once the lab has accepted the tube", () => {
    expect(resultsNeedWarning(sampleWith("qabul_qilindi"))).toBe(false);
    expect(resultsWarning(sampleWith("qabul_qilindi"))).toBeNull();
  });

  it("warns for every state before acceptance", () => {
    expect(resultsNeedWarning(sampleWith("kutilmoqda"))).toBe(true);
    expect(resultsNeedWarning(sampleWith("olindi"))).toBe(true);
    expect(resultsNeedWarning(sampleWith("rad_etildi"))).toBe(true);
  });

  it("does not warn on orders that predate sample tracking", () => {
    // Blocking these would strand exactly the backlog the lab wants cleared.
    expect(resultsNeedWarning(null)).toBe(false);
    expect(resultsNeedWarning(undefined)).toBe(false);
    expect(resultsWarning(null)).toBeNull();
  });

  it("says something specific for each warned state", () => {
    for (const s of ["kutilmoqda", "olindi", "rad_etildi"] as const) {
      expect(resultsWarning(sampleWith(s))).toBeTruthy();
    }
  });
});
