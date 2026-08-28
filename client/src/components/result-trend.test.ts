/**
 * The trend chart plots a patient's history, so the thing that matters is what
 * it refuses to plot. A result cell holds prose as often as it holds a number
 * ("manfiy", "3-5 ta k/s"), and silently coercing one of those into a point on
 * a medical chart would invent data.
 */
import { describe, expect, it } from "vitest";
import type { OrderWithDetails } from "@shared/schema";
import { buildSeries } from "./result-trend";

/** Minimal order shaped like the API's, with only the fields the chart reads. */
function order(
  orderNumber: number,
  createdAt: string,
  items: { testName: string; result: string | null; unit?: string; referenceRange?: string }[],
): OrderWithDetails {
  return {
    id: `o${orderNumber}`,
    orderNumber,
    patientId: "p1",
    totalAmount: 0,
    discount: 0,
    paidAmount: 0,
    status: "completed",
    notes: null,
    referrer: null,
    createdBy: null,
    createdAt,
    completedAt: createdAt,
    telegramSentAt: null,
    patient: null,
    items: items.map((i, n) => ({
      id: `${orderNumber}-${n}`,
      orderId: `o${orderNumber}`,
      testId: `t${n}`,
      testName: i.testName,
      price: 0,
      unit: i.unit ?? null,
      referenceRange: i.referenceRange ?? null,
      result: i.result,
      flag: null,
      notes: null,
      enteredBy: null,
      completedAt: null,
    })),
  } as OrderWithDetails;
}

describe("buildSeries", () => {
  it("lines a repeated test up into one series", () => {
    const series = buildSeries([
      order(2, "2026-03-01T09:00:00Z", [{ testName: "Gemoglobin", result: "140" }]),
      order(1, "2026-01-01T09:00:00Z", [{ testName: "Gemoglobin", result: "120" }]),
    ]);

    expect(series).toHaveLength(1);
    expect(series[0].testName).toBe("Gemoglobin");
    expect(series[0].points.map((p) => p.value)).toEqual([120, 140]);
  });

  it("sorts oldest first, whatever order the API returned", () => {
    // The orders endpoint returns newest-first; a chart has to read forwards.
    const series = buildSeries([
      order(3, "2026-05-01T09:00:00Z", [{ testName: "Glyukoza", result: "6.0" }]),
      order(1, "2026-01-01T09:00:00Z", [{ testName: "Glyukoza", result: "5.0" }]),
      order(2, "2026-03-01T09:00:00Z", [{ testName: "Glyukoza", result: "5.5" }]),
    ]);
    expect(series[0].points.map((p) => p.value)).toEqual([5, 5.5, 6]);
    expect(series[0].points.map((p) => p.orderNumber)).toEqual([1, 2, 3]);
  });

  it("reads a decimal comma, as the result fields allow", () => {
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [{ testName: "Glyukoza", result: "5,4" }]),
      order(2, "2026-02-01T09:00:00Z", [{ testName: "Glyukoza", result: "6,1" }]),
    ]);
    expect(series[0].points.map((p) => p.value)).toEqual([5.4, 6.1]);
  });

  it("drops results that are not measurements", () => {
    // Plotting any of these would be inventing a number the lab never reported.
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [
        { testName: "HBsAg", result: "manfiy" },
        { testName: "Eritrotsit", result: "3-5 ta k/s" },
        { testName: "Titr", result: "1:80" },
        { testName: "Gemoglobin", result: "130" },
      ]),
      order(2, "2026-02-01T09:00:00Z", [
        { testName: "HBsAg", result: "manfiy" },
        { testName: "Eritrotsit", result: "3-5 ta k/s" },
        { testName: "Titr", result: "1:160" },
        { testName: "Gemoglobin", result: "135" },
      ]),
    ]);
    expect(series.map((s) => s.testName)).toEqual(["Gemoglobin"]);
  });

  it("ignores lines with no result yet", () => {
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [{ testName: "Gemoglobin", result: "130" }]),
      order(2, "2026-02-01T09:00:00Z", [{ testName: "Gemoglobin", result: null }]),
      order(3, "2026-03-01T09:00:00Z", [{ testName: "Gemoglobin", result: "138" }]),
    ]);
    expect(series[0].points.map((p) => p.value)).toEqual([130, 138]);
  });

  it("hides a test measured only once — one point is not a trend", () => {
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [
        { testName: "Gemoglobin", result: "130" },
        { testName: "Kreatinin", result: "80" },
      ]),
      order(2, "2026-02-01T09:00:00Z", [{ testName: "Gemoglobin", result: "135" }]),
    ]);
    expect(series.map((s) => s.testName)).toEqual(["Gemoglobin"]);
  });

  it("offers the most-measured test first", () => {
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [
        { testName: "Gemoglobin", result: "130" },
        { testName: "Glyukoza", result: "5.0" },
      ]),
      order(2, "2026-02-01T09:00:00Z", [
        { testName: "Gemoglobin", result: "132" },
        { testName: "Glyukoza", result: "5.2" },
      ]),
      order(3, "2026-03-01T09:00:00Z", [{ testName: "Gemoglobin", result: "134" }]),
    ]);
    expect(series.map((s) => s.testName)).toEqual(["Gemoglobin", "Glyukoza"]);
  });

  it("carries the unit and reference range through for the axis and band", () => {
    const series = buildSeries([
      order(1, "2026-01-01T09:00:00Z", [
        { testName: "Gemoglobin", result: "130", unit: "g/l", referenceRange: "130-170" },
      ]),
      order(2, "2026-02-01T09:00:00Z", [
        { testName: "Gemoglobin", result: "140", unit: "g/l", referenceRange: "130-170" },
      ]),
    ]);
    expect(series[0].unit).toBe("g/l");
    expect(series[0].referenceRange).toBe("130-170");
  });

  it("returns nothing for a patient with no numeric history", () => {
    expect(buildSeries([])).toEqual([]);
    expect(
      buildSeries([order(1, "2026-01-01T09:00:00Z", [{ testName: "HBsAg", result: "manfiy" }])]),
    ).toEqual([]);
  });
});
