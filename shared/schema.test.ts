/**
 * Phone normalisation and the money-handling schemas.
 *
 * Phones are the join key between a patient row and a Telegram chat, so a
 * normalisation bug does not show up as a crash — it shows up as results
 * silently never reaching a patient.
 */
import { describe, expect, it } from "vitest";
import {
  createPaymentSchema,
  createOrderSchema,
  insertExpenseSchema,
  nationalPhoneDigits,
  normalizeUzPhone,
  changePasswordSchema,
  updateOrderSchema,
} from "./schema";

describe("nationalPhoneDigits", () => {
  it("reduces every written form to the same nine digits", () => {
    for (const input of [
      "+998901234567",
      "998901234567",
      "+998 90 123 45 67",
      "998 90 123-45-67",
      "8 901234567",
      "901234567",
      "90 123 45 67",
    ]) {
      expect(nationalPhoneDigits(input)).toBe("901234567");
    }
  });

  it("keeps the 99 operator code intact", () => {
    // The regression this guards: a national part that itself starts with 998.
    // Blindly stripping "998" anywhere would eat the first three digits.
    expect(nationalPhoneDigits("+998 99 833 22 11")).toBe("998332211");
    expect(nationalPhoneDigits("998998332211")).toBe("998332211");
  });

  it("is empty for junk", () => {
    expect(nationalPhoneDigits("")).toBe("");
    expect(nationalPhoneDigits(null)).toBe("");
    expect(nationalPhoneDigits("salom")).toBe("");
  });
});

describe("normalizeUzPhone", () => {
  it("emits one canonical shape", () => {
    expect(normalizeUzPhone("998901234567")).toBe("+998 90 123 45 67");
    expect(normalizeUzPhone("+998 90 123-45-67")).toBe("+998 90 123 45 67");
  });

  it("leaves an unrecognisable number as typed rather than mangling it", () => {
    expect(normalizeUzPhone("12345")).toBe("12345");
  });
});

describe("createPaymentSchema", () => {
  it("accepts a payment and a refund", () => {
    expect(createPaymentSchema.parse({ amount: 50000 }).amount).toBe(50000);
    expect(createPaymentSchema.parse({ amount: -50000 }).amount).toBe(-50000);
  });

  it("defaults the method to cash", () => {
    expect(createPaymentSchema.parse({ amount: 1000 }).method).toBe("naqd");
  });

  it("rejects a zero movement, which would be a no-op row in the ledger", () => {
    expect(createPaymentSchema.safeParse({ amount: 0 }).success).toBe(false);
  });

  it("rejects an unknown method", () => {
    expect(createPaymentSchema.safeParse({ amount: 1000, method: "bitcoin" }).success).toBe(false);
  });
});

describe("insertExpenseSchema", () => {
  it("requires a real amount and a known category", () => {
    expect(insertExpenseSchema.safeParse({ category: "Reaktivlar", amount: 0 }).success).toBe(false);
    expect(insertExpenseSchema.safeParse({ category: "Kosmos", amount: 100 }).success).toBe(false);
  });

  it("defaults spentOn to today when omitted", () => {
    const parsed = insertExpenseSchema.parse({ category: "Ijara", amount: 100 });
    expect(parsed.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects a malformed date", () => {
    expect(
      insertExpenseSchema.safeParse({ category: "Ijara", amount: 100, spentOn: "08.08.2026" }).success,
    ).toBe(false);
  });
});

describe("createOrderSchema", () => {
  it("needs at least one test", () => {
    expect(createOrderSchema.safeParse({ patientId: "p1", testIds: [] }).success).toBe(false);
  });

  it("defaults discount and paid to zero", () => {
    const parsed = createOrderSchema.parse({ patientId: "p1", testIds: ["1"] });
    expect(parsed.discount).toBe(0);
    expect(parsed.paidAmount).toBe(0);
  });

  it("refuses a negative discount, which would inflate the bill", () => {
    expect(
      createOrderSchema.safeParse({ patientId: "p1", testIds: ["1"], discount: -5000 }).success,
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = { currentPassword: "eski123", newPassword: "yangi123", confirmPassword: "yangi123" };

  it("accepts a well-formed change", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a mismatched confirmation", () => {
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: "boshqa" }).success).toBe(false);
  });

  it("rejects reusing the current password", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "eski123",
        newPassword: "eski123",
        confirmPassword: "eski123",
      }).success,
    ).toBe(false);
  });

  it("rejects a password that is too short", () => {
    expect(
      changePasswordSchema.safeParse({ ...base, newPassword: "abc", confirmPassword: "abc" }).success,
    ).toBe(false);
  });
});

/**
 * A repeat of the same test is one line, not two.
 *
 * Found by an adversarial pass against the running API: the price is summed
 * per line, so an order carrying the same test three times billed the patient
 * three times for one tube. The order form cannot produce that, but a
 * double-submit or a retry can — which is why the rule lives in the schema
 * every caller goes through rather than in the form.
 */
describe("createOrderSchema — duplicate tests", () => {
  it("collapses a repeated test to a single line", () => {
    const parsed = createOrderSchema.parse({
      patientId: "p1",
      testIds: ["t1", "t1", "t1"],
    });
    expect(parsed.testIds).toEqual(["t1"]);
  });

  it("keeps distinct tests, in the order they were chosen", () => {
    const parsed = createOrderSchema.parse({
      patientId: "p1",
      testIds: ["t2", "t1", "t2", "t3"],
    });
    expect(parsed.testIds).toEqual(["t2", "t1", "t3"]);
  });

  it("still refuses an empty selection", () => {
    expect(() => createOrderSchema.parse({ patientId: "p1", testIds: [] })).toThrow();
  });

  it("applies the same rule when an order is edited", () => {
    const parsed = updateOrderSchema.parse({ testIds: ["t1", "t1", "t2"] });
    expect(parsed.testIds).toEqual(["t1", "t2"]);
  });
});
