/**
 * Turns a written reference range and a typed result into low / normal / high.
 *
 * The ranges in this app are prose, not structured data — they were written for
 * a human reading a printed form ("Erkak: 130-170, Ayol: 120-150", "< 41",
 * "3.9-6.1"). Rather than migrate 119 rows to a schema nobody would maintain,
 * this reads the prose.
 *
 * The rule throughout is: **when in doubt, return null.** A wrong flag on a
 * medical form is worse than no flag, because the laborant stops checking. So
 * anything this cannot parse with confidence is handed back for a human to
 * decide, and the UI keeps the manual buttons for exactly that case.
 */
import type { ResultFlag } from "./schema";

/** Sex-qualified bounds, since many ranges differ for men and women. */
type Bounds = { min?: number; max?: number };

/** What the caller knows about the patient. Gender may be unrecorded. */
export type RangeContext = { gender?: string | null };

/**
 * A result cell can hold things that are not measurements at all — "manfiy",
 * "musbat", "topilmadi", "3-5 ta k/s". Only a value that is purely a number
 * (after normalising the decimal comma) is comparable.
 */
export function parseResultValue(result: string | null | undefined): number | null {
  const raw = (result ?? "").trim().replace(",", ".");
  if (!raw) return null;
  // Deliberately strict: "3-5" is a range, "12 ta" is a count with a unit, and
  // neither can be compared against a numeric bound without guessing.
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`-?\d+(?:[.,]\d+)?`;

const toNum = (s: string) => Number(s.replace(",", "."));

/**
 * Pulls the bounds out of one clause — the part after any "Erkak:" label.
 * Handles the four shapes that actually occur in the catalogue:
 *   "130-170"  "< 41"  "> 1.0"  "3.4-20.5"
 * plus the "Umumiy: 3.4-20.5" prefix, whose label is not a sex and is dropped.
 */
function parseBounds(clause: string): Bounds | null {
  const text = clause.trim();

  const between = text.match(new RegExp(`(${NUM})\\s*[-–—]\\s*(${NUM})`));
  if (between) {
    const min = toNum(between[1]);
    const max = toNum(between[2]);
    // A "range" that runs backwards is a parse artefact, not data.
    if (min <= max) return { min, max };
    return null;
  }

  const upper = text.match(new RegExp(`[<≤]\\s*(${NUM})`));
  if (upper) return { max: toNum(upper[1]) };

  const lower = text.match(new RegExp(`[>≥]\\s*(${NUM})`));
  if (lower) return { min: toNum(lower[1]) };

  return null;
}

const MALE = /erkak|мужч|male/i;
const FEMALE = /ayol|женщ|female/i;

/**
 * Picks the clause that applies to this patient. Ranges are written either as
 * one unqualified rule or as sex-split rules separated by a comma.
 *
 * When the range is sex-split but the patient's sex is unrecorded, this returns
 * null rather than guessing a side — flagging a woman's haemoglobin against the
 * male range is exactly the kind of quiet error that erodes trust in the flag.
 */
function selectClause(range: string, ctx: RangeContext): string | null {
  const clauses = range.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
  const sexed = clauses.filter((c) => MALE.test(c) || FEMALE.test(c));

  if (sexed.length === 0) return range;

  const gender = (ctx.gender ?? "").trim().toLowerCase();
  const wantMale = MALE.test(gender);
  const wantFemale = FEMALE.test(gender);
  if (!wantMale && !wantFemale) return null;

  const match = sexed.find((c) => (wantMale ? MALE.test(c) : FEMALE.test(c)));
  if (!match) return null;

  // Drop the "Erkak:" label so only the numbers reach parseBounds.
  return match.replace(/^[^:]*:/, "");
}

/**
 * low / normal / high, or null when it cannot be decided.
 *
 * Null is returned for a non-numeric result, an unparseable range, or a
 * sex-split range with no recorded sex. Callers must treat null as "leave
 * whatever the human chose alone", never as "normal".
 */
export function computeFlag(
  result: string | null | undefined,
  referenceRange: string | null | undefined,
  ctx: RangeContext = {},
): ResultFlag | null {
  const value = parseResultValue(result);
  if (value === null) return null;

  const range = (referenceRange ?? "").trim();
  if (!range) return null;

  const clause = selectClause(range, ctx);
  if (clause === null) return null;

  const bounds = parseBounds(clause);
  if (!bounds) return null;
  if (bounds.min === undefined && bounds.max === undefined) return null;

  if (bounds.min !== undefined && value < bounds.min) return "low";
  if (bounds.max !== undefined && value > bounds.max) return "high";
  return "normal";
}
