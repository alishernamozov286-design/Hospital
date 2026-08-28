/**
 * The rules governing a sample tube.
 *
 * Kept out of both storage backends so there is exactly one answer to "may
 * this tube move to that status", and so the answer can be unit-tested without
 * a database. The server enforces these; the client uses the same functions to
 * decide which buttons to show, which is why they live in shared/.
 */
import { SAMPLE_STATUS_LABELS, type Sample, type SampleStatus } from "./schema";

/**
 * The barcode printed on the tube.
 *
 * Derived from the order number rather than random, on purpose: when a scanner
 * fails or a label smudges, a human has to be able to read the tube and find
 * the order, and "LAB-1042" is a number the registrar already said out loud.
 * The order number is itself allocated by a Postgres identity sequence, so
 * this inherits its uniqueness rather than inventing its own.
 *
 * The prefix exists so a scanner reading a barcode from some other system in
 * the same rack does not resolve to one of our orders by coincidence.
 */
export const BARCODE_PREFIX = "LAB";

export function sampleBarcode(orderNumber: number): string {
  return `${BARCODE_PREFIX}-${orderNumber}`;
}

/**
 * Reads a scanned or typed string back to an order number.
 *
 * Deliberately forgiving about the things a barcode wedge and a tired hand
 * actually produce — surrounding whitespace, lower case, a missing prefix when
 * someone just types the number — and strict about everything else. Returns
 * null rather than throwing: a bad scan is an ordinary event, not an error.
 */
export function parseBarcode(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return null;

  const match = raw.match(new RegExp(`^(?:${BARCODE_PREFIX}[-\\s]?)?(\\d{1,9})$`));
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Which statuses a tube may move to from where it is now.
 *
 * Two properties this encodes, both learned from how the paper process fails:
 *
 *  - Rejection is reachable from any live state and is terminal. A tube found
 *    to be haemolysed after it was accepted still has to be rejectable, and a
 *    rejected tube is thrown away — it cannot come back without a new draw.
 *  - A step back is allowed while the tube is still live (olindi →
 *    kutilmoqda), because the common real mistake is clicking one row too far
 *    down the list, and a correction that needs an administrator is a
 *    correction that gets faked instead.
 */
const TRANSITIONS: Record<SampleStatus, readonly SampleStatus[]> = {
  kutilmoqda: ["olindi", "rad_etildi"],
  olindi: ["qabul_qilindi", "kutilmoqda", "rad_etildi"],
  qabul_qilindi: ["olindi", "rad_etildi"],
  // Terminal: the tube is physically gone. A new draw is a new sample.
  rad_etildi: [],
};

export function canTransition(from: SampleStatus, to: SampleStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The statuses a tube in `from` may be moved to — what the UI offers. */
export function nextStatuses(from: SampleStatus): readonly SampleStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Human-readable refusal, so the API and the UI say the same thing. */
export function transitionError(from: SampleStatus, to: SampleStatus): string {
  if (from === to) return `Namuna allaqachon "${SAMPLE_STATUS_LABELS[to]}" holatida`;
  if (from === "rad_etildi") return "Rad etilgan namunani qayta ochib bo'lmaydi";
  return `"${SAMPLE_STATUS_LABELS[from]}" holatidan "${SAMPLE_STATUS_LABELS[to]}" holatiga o'tib bo'lmaydi`;
}

/**
 * Whether results may be typed against this tube without a warning.
 *
 * Only "qabul_qilindi" is silent: that is the laboratory's own statement that
 * the tube is fit to run, and a value entered before it is a value entered
 * against something nobody has confirmed exists.
 *
 * A missing sample counts as fine. Orders predate this feature, and blocking
 * on their behalf would strand exactly the backlog the lab is trying to clear.
 */
export function resultsNeedWarning(sample: Sample | null | undefined): boolean {
  if (!sample) return false;
  return sample.status !== "qabul_qilindi";
}

/** The warning itself, or null when there is nothing to say. */
export function resultsWarning(sample: Sample | null | undefined): string | null {
  if (!sample || !resultsNeedWarning(sample)) return null;

  switch (sample.status) {
    case "rad_etildi":
      return "Bu namuna rad etilgan — natija kiritishdan oldin yangi namuna oling";
    case "kutilmoqda":
      return "Namuna hali olinmagan";
    case "olindi":
      return "Namuna laboratoriyada qabul qilinmagan";
    default:
      return null;
  }
}
