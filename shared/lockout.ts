/**
 * Escalating account lockout.
 *
 * Three wrong passwords lock the account for an hour. Every wrong password
 * after that lengthens the next lock — 2 hours, then 3 — and once those are
 * exhausted the account is locked for a week and needs an administrator.
 *
 * The state lives on the user row (see users.lockedUntil / lockLevel), not in
 * memory: a lock that a server restart or a serverless cold start quietly
 * lifts would be worse than no lock at all, because nobody would know.
 *
 * Two deliberate limits on how far this goes:
 *
 *  - It gates *signing in*, nothing else. A locked account's existing session
 *    keeps working; the lock is about stopping someone guessing their way in,
 *    not about ejecting whoever is already at the counter mid-shift.
 *  - An administrator can always clear it. Without that, one tired laborant
 *    mistyping their password four times takes the lab's results workflow
 *    offline for a week.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Wrong passwords tolerated before the first lock. */
export const ATTEMPTS_BEFORE_LOCK = 3;

/**
 * How long each successive lock lasts.
 *
 * After the first (3 strikes → 1 hour), a *single* further wrong password is
 * enough to trigger the next one: someone who comes back the moment an hour
 * expires and guesses again is not a user who forgot their password.
 */
export const LOCK_DURATIONS_MS = [1 * HOUR, 2 * HOUR, 3 * HOUR];

/** The final lock, once the escalating ones are used up. */
export const FINAL_LOCK_MS = 7 * 24 * HOUR;

/** The lockout fields as they are stored on a user row. */
export type LockState = {
  failedAttempts: number;
  lockedUntil: string | null;
  lockLevel: number;
};

/** What a failed password does to that state. */
export type LockDecision = LockState & {
  /** True when this particular failure started a new lock. */
  justLocked: boolean;
  /** Length of the lock that just started, if one did. */
  lockedForMs: number | null;
};

export const UNLOCKED: LockState = { failedAttempts: 0, lockedUntil: null, lockLevel: 0 };

/** How long the given lock has left, in ms. Zero once it has expired. */
export function lockRemainingMs(lockedUntil: string | Date | null | undefined, now = Date.now()): number {
  if (!lockedUntil) return 0;
  const until = new Date(lockedUntil).getTime();
  // An unreadable timestamp is treated as "not locked" rather than as a
  // permanent lock: failing open here only costs a password attempt, whereas
  // failing closed could strand an account with no way back.
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}

export function isLocked(state: Pick<LockState, "lockedUntil">, now = Date.now()): boolean {
  return lockRemainingMs(state.lockedUntil, now) > 0;
}

/**
 * Applies one wrong password.
 *
 * The counter is *not* reset when a lock expires — that is the whole point of
 * the escalation. Someone who waits out the hour and immediately guesses again
 * lands straight on the two-hour lock.
 */
export function registerFailure(state: LockState, now = Date.now()): LockDecision {
  const attempts = state.failedAttempts + 1;

  // Already served at least one lock: a single further failure escalates.
  const threshold = state.lockLevel === 0 ? ATTEMPTS_BEFORE_LOCK : 1;

  if (attempts < threshold) {
    return {
      failedAttempts: attempts,
      lockedUntil: state.lockedUntil,
      lockLevel: state.lockLevel,
      justLocked: false,
      lockedForMs: null,
    };
  }

  const duration = lockDurationFor(state.lockLevel);
  return {
    // The count restarts for the next round; lockLevel is what remembers.
    failedAttempts: 0,
    lockedUntil: new Date(now + duration).toISOString(),
    lockLevel: state.lockLevel + 1,
    justLocked: true,
    lockedForMs: duration,
  };
}

/** The length of the lock a given level earns. Past the table, it is a week. */
export function lockDurationFor(level: number): number {
  return LOCK_DURATIONS_MS[level] ?? FINAL_LOCK_MS;
}

/** True once the account has escalated all the way to the week-long lock. */
export function isFinalLock(state: Pick<LockState, "lockLevel">): boolean {
  return state.lockLevel > LOCK_DURATIONS_MS.length;
}

/**
 * A correct password clears everything, including the escalation.
 *
 * Someone who gets in has demonstrated the account is theirs, so holding a
 * previous bad afternoon against their next one would only punish honest
 * typing.
 */
export function registerSuccess(): LockState {
  return { ...UNLOCKED };
}

// ------------------------------------------------------------------ display

/** "1 soat 5 daqiqa", "6 kun", "2 daqiqa" — for the message on the login screen. */
export function formatLockRemaining(ms: number): string {
  if (ms <= 0) return "0 daqiqa";

  const totalMinutes = Math.ceil(ms / MINUTE);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  // Only ever two units: "6 kun 4 soat" reads; "6 kun 4 soat 12 daqiqa" does not.
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} kun`);
    if (hours > 0) parts.push(`${hours} soat`);
  } else if (hours > 0) {
    parts.push(`${hours} soat`);
    if (minutes > 0) parts.push(`${minutes} daqiqa`);
  } else {
    parts.push(`${minutes} daqiqa`);
  }
  return parts.join(" ");
}

/** The message the login screen shows while an account is locked. */
export function lockMessage(remainingMs: number, finalLock: boolean): string {
  const left = formatLockRemaining(remainingMs);
  if (finalLock) {
    return `Hisob bir haftaga qulflandi. ${left} qoldi — administratorga murojaat qiling.`;
  }
  return `Ko'p marta xato parol kiritildi. Hisob qulflandi, ${left} dan so'ng qayta urinib ko'ring.`;
}

/**
 * Warning shown after a wrong password, before the lock actually falls.
 *
 * Every remaining attempt is counted out loud, from the first mistake onwards.
 * Someone mistyping their own password deserves to know how close they are to
 * losing an hour of their shift, and the escalation is steep enough after the
 * first lock that a silent slide into a week-long lock would be unfair.
 */
export function attemptsLeftMessage(attemptsLeft: number, lockLevel = 0): string | null {
  if (attemptsLeft <= 0) return null;

  // Past the first lock a single mistake re-locks, and for longer each time —
  // so the warning names the actual penalty rather than counting attempts.
  if (lockLevel > 0) {
    const next = formatLockRemaining(lockDurationFor(lockLevel));
    return `Diqqat: yana bitta xato urinishda hisob ${next}ga qulflanadi.`;
  }

  return attemptsLeft === 1
    ? "Yana bitta xato urinishdan so'ng hisob 1 soatga qulflanadi."
    : `Yana ${attemptsLeft} ta urinish qoldi — keyin hisob qulflanadi.`;
}
