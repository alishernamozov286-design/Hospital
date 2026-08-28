/**
 * The flag decides whether a printed result reads as "past" or "yuqori" next to
 * a patient's name. A wrong one is worse than none at all, so the cases that
 * matter most here are the ones where the parser must REFUSE to answer.
 */
import { describe, expect, it } from "vitest";
import { computeFlag, parseResultValue } from "./reference-range";

describe("parseResultValue", () => {
  it("reads plain numbers, including a decimal comma", () => {
    expect(parseResultValue("95")).toBe(95);
    expect(parseResultValue("3.9")).toBe(3.9);
    expect(parseResultValue("3,9")).toBe(3.9);
    expect(parseResultValue("  12  ")).toBe(12);
  });

  it("refuses anything that is not purely a number", () => {
    // These are all real shapes a result cell holds in this lab.
    for (const v of ["manfiy", "musbat", "topilmadi", "3-5", "12 ta", "1:80", "", null, undefined]) {
      expect(parseResultValue(v)).toBeNull();
    }
  });
});

describe("computeFlag — plain ranges", () => {
  it("classifies against a two-sided range", () => {
    expect(computeFlag("3.5", "3.9-6.1")).toBe("low");
    expect(computeFlag("5.0", "3.9-6.1")).toBe("normal");
    expect(computeFlag("7.2", "3.9-6.1")).toBe("high");
  });

  it("treats the bounds themselves as normal", () => {
    expect(computeFlag("3.9", "3.9-6.1")).toBe("normal");
    expect(computeFlag("6.1", "3.9-6.1")).toBe("normal");
  });

  it("handles an upper-bound-only range", () => {
    expect(computeFlag("30", "< 41")).toBe("normal");
    expect(computeFlag("55", "< 41")).toBe("high");
  });

  it("handles a lower-bound-only range, where higher is the healthy direction", () => {
    // HDL: "> 1.0" is a target to clear, so 1.4 is normal, not high.
    expect(computeFlag("1.4", "> 1.0")).toBe("normal");
    expect(computeFlag("0.8", "> 1.0")).toBe("low");
  });

  it("ignores a non-sex label before the numbers", () => {
    expect(computeFlag("12.0", "Umumiy: 3.4-20.5")).toBe("normal");
  });
});

describe("computeFlag — sex-split ranges", () => {
  const HB = "Erkak: 130-170, Ayol: 120-150";

  it("picks the clause matching the patient", () => {
    expect(computeFlag("125", HB, { gender: "erkak" })).toBe("low");
    expect(computeFlag("125", HB, { gender: "ayol" })).toBe("normal");
  });

  it("refuses when the range is sex-split but the sex is unknown", () => {
    // Guessing a side here would quietly mis-flag half the patients.
    expect(computeFlag("125", HB)).toBeNull();
    expect(computeFlag("125", HB, { gender: null })).toBeNull();
    expect(computeFlag("125", HB, { gender: "" })).toBeNull();
  });

  it("reads sex-split lower bounds", () => {
    const hdl = "Erkak: > 1.0, Ayol: > 1.2";
    expect(computeFlag("1.1", hdl, { gender: "ayol" })).toBe("low");
    expect(computeFlag("1.1", hdl, { gender: "erkak" })).toBe("normal");
  });
});

describe("computeFlag — refuses rather than guesses", () => {
  it("returns null for a non-numeric result", () => {
    expect(computeFlag("manfiy", "3.9-6.1")).toBeNull();
    expect(computeFlag("3-5", "3.9-6.1")).toBeNull();
  });

  it("returns null for a range it cannot read", () => {
    for (const range of ["", "Manfiy", "Topilmadi", "Aniqlanmadi", "Ko'rsatkichlar bo'yicha", null]) {
      expect(computeFlag("5.0", range)).toBeNull();
    }
  });

  it("returns null for a backwards range rather than inverting it", () => {
    expect(computeFlag("5", "10-2")).toBeNull();
  });
});
