import { nationalPhoneDigits } from "@shared/schema";
import type { OrderStatus, ResultFlag, Role, SampleStatus } from "@shared/schema";

/** Non-breaking space, so a so'm amount or a phone number never wraps mid-value. */
const NBSP = " ";
const MINUS = "−";
const DASH = "—";

// ------------------------------------------------------------------- money

/**
 * 1250000 -> "1 250 000 so'm". Grouped by hand rather than through Intl:
 * Chrome's uz-UZ locale data groups with commas, but Uzbek financial
 * documents use spaces.
 */
export function money(value: number, withSuffix = true): string {
  const rounded = Math.round(value || 0);
  const sign = rounded < 0 ? MINUS : "";
  const grouped = groupDigits(Math.abs(rounded));
  return withSuffix ? `${sign}${grouped}${NBSP}so'm` : `${sign}${grouped}`;
}

/** 1250000 -> "1 250 000". The single place that decides the thousands separator. */
export function groupDigits(value: number | string): string {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  // Strip leading zeros so "007" reads as "7", but keep a lone "0".
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  return trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** "1 250 000" (any spacing) -> 1250000. Empty input becomes 0. */
export function parseMoney(value: string): number {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

/** Compact form for chart axes: 1 250 000 -> "1,3 mln". */
export function moneyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}${NBSP}mln`;
  if (abs >= 1_000) return `${Math.round(value / 1000)}${NBSP}ming`;
  return String(value);
}

// ------------------------------------------------------------------- phone

/** Every digit in the value, country code included. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Re-exported rather than reimplemented on purpose. The input mask, the display
 * formatter and the server's normalizeUzPhone() must agree on exactly what
 * counts as the "998" country code — when they did not, typing the third digit
 * of a 99 8xx xx xx number wiped the field. One rule, one place.
 */
export { nationalPhoneDigits };

/**
 * Groups digits that are ALREADY national: "998334455" -> "+998 99 833 44 55".
 *
 * Deliberately does not strip a country code. Numbers on the 99 operator code
 * have a national part that itself begins with "998" (99 8xx xx xx), so running
 * the country-code strip over an already-national value would eat the first
 * three digits — which is exactly what the input mask must never do.
 */
export function formatNationalDigits(national: string, breakable = false): string {
  const space = breakable ? " " : NBSP;
  const n = national.slice(0, 9);
  const groups = [n.slice(0, 2), n.slice(2, 5), n.slice(5, 7), n.slice(7, 9)].filter(Boolean);
  return `+998${space}${groups.join(space)}`;
}

/**
 * Canonical display form: "+998 90 123 45 67". Partial input is grouped as far
 * as it goes, so the value stays readable while it is being typed.
 */
export function formatPhone(value: string | null | undefined, breakable = false): string {
  const n = nationalPhoneDigits(value);
  if (!n) {
    // Nothing recognisable — show whatever was stored rather than an empty cell.
    const raw = (value ?? "").trim();
    return raw || DASH;
  }
  return formatNationalDigits(n, breakable);
}

/** What goes into the storage layer and into `tel:` links — no spaces at all. */
export function phoneE164(value: string | null | undefined): string {
  const n = nationalPhoneDigits(value);
  return n.length === 9 ? `+998${n}` : (value ?? "").trim();
}

/** True once the number is a complete Uzbek mobile/landline number. */
export function isCompletePhone(value: string | null | undefined): boolean {
  return nationalPhoneDigits(value).length === 9;
}

/** Digits of both the query and the phone, so "901234567" finds "+998 90 123 45 67". */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  const q = phoneDigits(query);
  if (!q) return false;
  return phoneDigits(phone).includes(q);
}

// -------------------------------------------------------------------- dates

const MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return DASH;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatLongDate(value: string | Date): string {
  const d = new Date(value);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** "5-avgust, chorshanba" — the dashboard's date line. */
export function formatWeekdayDate(value: string | Date = new Date()): string {
  const d = new Date(value);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
}

/** "5 daqiqa oldin" / "2 soat oldin" — used in the recent-orders feed. */
export function timeAgo(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return formatDate(value);
}

/** Local calendar day as YYYY-MM-DD — must match the server's localDay(). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

// -------------------------------------------------------------------- people

export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Six brand-adjacent gradients, picked deterministically so an avatar never changes colour. */
const AVATAR_GRADIENTS = [
  "from-sky-500 to-cyan-400",
  "from-teal-500 to-emerald-400",
  "from-violet-500 to-indigo-400",
  "from-amber-500 to-orange-400",
  "from-rose-500 to-pink-400",
  "from-blue-600 to-sky-400",
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function genderLabel(gender: string | null | undefined): string {
  if (gender === "erkak") return "Erkak";
  if (gender === "ayol") return "Ayol";
  return DASH;
}

/** "35 yosh · Erkak" for table cells and the print blank. */
export function ageGender(age: number | null | undefined, gender: string | null | undefined): string {
  const parts = [age ? `${age} yosh` : null, gender ? genderLabel(gender) : null].filter(Boolean);
  return parts.join(" · ") || DASH;
}

// -------------------------------------------------------------------- badges

export const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300 dark:bg-amber-400/10 dark:border-amber-400/25",
  in_progress:
    "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300 dark:bg-sky-400/10 dark:border-sky-400/25",
  completed:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:bg-emerald-400/10 dark:border-emerald-400/25",
  cancelled:
    "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300 dark:bg-rose-400/10 dark:border-rose-400/25",
};

/** The 2px dot in front of a status badge — same hue, full strength. */
export const STATUS_DOTS: Record<OrderStatus, string> = {
  pending: "bg-amber-500",
  in_progress: "bg-sky-500",
  completed: "bg-emerald-500",
  cancelled: "bg-rose-500",
};

/**
 * Sample statuses reuse the order palette's meaning rather than inventing a
 * second colour language: waiting is amber, in-flight is sky, done is emerald,
 * refused is rose. A laborant scanning a screen should not have to learn which
 * badge family they are looking at to know whether something needs them.
 */
export const SAMPLE_STATUS_STYLES: Record<SampleStatus, string> = {
  kutilmoqda:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300 dark:bg-amber-400/10 dark:border-amber-400/25",
  olindi:
    "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300 dark:bg-sky-400/10 dark:border-sky-400/25",
  qabul_qilindi:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:bg-emerald-400/10 dark:border-emerald-400/25",
  rad_etildi:
    "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300 dark:bg-rose-400/10 dark:border-rose-400/25",
};

export const SAMPLE_STATUS_DOTS: Record<SampleStatus, string> = {
  kutilmoqda: "bg-amber-500",
  olindi: "bg-sky-500",
  qabul_qilindi: "bg-emerald-500",
  rad_etildi: "bg-rose-500",
};

export const FLAG_LABELS: Record<ResultFlag, string> = {
  low: "Past",
  normal: "Me'yorida",
  high: "Yuqori",
};

export const FLAG_STYLES: Record<ResultFlag, string> = {
  low: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300 dark:border-sky-400/25",
  normal: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-400/25",
  high: "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300 dark:border-rose-400/25",
};

export const ROLE_STYLES: Record<Role, string> = {
  admin: "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300 dark:border-violet-400/25",
  registrator: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300 dark:border-sky-400/25",
  laborant: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-400/25",
};

/** Payment state derived from total vs paid — drives the badge on order rows. */
export function paymentState(
  total: number,
  paid: number,
): { label: string; className: string; dot: string } {
  if (paid >= total && total > 0) {
    return {
      label: "To'langan",
      className:
        "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-400/25",
      dot: "bg-emerald-500",
    };
  }
  if (paid > 0) {
    return {
      label: "Qisman",
      className:
        "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300 dark:border-amber-400/25",
      dot: "bg-amber-500",
    };
  }
  return {
    label: "To'lanmagan",
    className:
      "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300 dark:border-rose-400/25",
    dot: "bg-rose-500",
  };
}
