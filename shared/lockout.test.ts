/**
 * The escalation ladder, pinned down.
 *
 * The rule the lab asked for: three wrong passwords lock the account for an
 * hour; each wrong password after that earns 2 hours, then 3; after those, a
 * week. These tests walk that ladder exactly, because an off-by-one here
 * either locks honest staff out too early or hands an attacker extra guesses.
 */
import { describe, expect, it } from "vitest";
import {
  ATTEMPTS_BEFORE_LOCK,
  FINAL_LOCK_MS,
  LOCK_DURATIONS_MS,
  UNLOCKED,
  attemptsLeftMessage,
  formatLockRemaining,
  isFinalLock,
  isLocked,
  lockDurationFor,
  lockMessage,
  lockRemainingMs,
  registerFailure,
  registerSuccess,
} from "./lockout";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = new Date("2026-08-09T09:00:00.000Z").getTime();

describe("the escalation ladder", () => {
  it("tolerates two wrong passwords without locking", () => {
    let state = { ...UNLOCKED };
    for (let i = 0; i < ATTEMPTS_BEFORE_LOCK - 1; i += 1) {
      const decision = registerFailure(state, NOW);
      expect(decision.justLocked).toBe(false);
      expect(decision.lockedUntil).toBeNull();
      state = decision;
    }
    expect(state.failedAttempts).toBe(2);
  });

  it("locks for 1 hour on the third wrong password", () => {
    let state = { ...UNLOCKED };
    let decision = registerFailure(state, NOW);
    decision = registerFailure(decision, NOW);
    decision = registerFailure(decision, NOW);

    expect(decision.justLocked).toBe(true);
    expect(decision.lockedForMs).toBe(1 * HOUR);
    expect(new Date(decision.lockedUntil!).getTime()).toBe(NOW + HOUR);
    expect(decision.lockLevel).toBe(1);
  });

  it("locks for 2 hours on the next wrong password after that", () => {
    // Someone who waits out the hour and immediately guesses again is not
    // a user who forgot their password, so one failure is enough.
    const afterFirstLock = { failedAttempts: 0, lockedUntil: null, lockLevel: 1 };
    const decision = registerFailure(afterFirstLock, NOW);

    expect(decision.justLocked).toBe(true);
    expect(decision.lockedForMs).toBe(2 * HOUR);
    expect(decision.lockLevel).toBe(2);
  });

  it("locks for 3 hours on the one after that", () => {
    const decision = registerFailure({ failedAttempts: 0, lockedUntil: null, lockLevel: 2 }, NOW);
    expect(decision.lockedForMs).toBe(3 * HOUR);
    expect(decision.lockLevel).toBe(3);
  });

  it("locks for a full week once the ladder is exhausted", () => {
    const decision = registerFailure({ failedAttempts: 0, lockedUntil: null, lockLevel: 3 }, NOW);
    expect(decision.lockedForMs).toBe(FINAL_LOCK_MS);
    expect(decision.lockedForMs).toBe(7 * 24 * HOUR);
    expect(isFinalLock(decision)).toBe(true);
  });

  it("stays on the week-long lock rather than escalating past it", () => {
    // Nothing longer than a week exists; further failures just re-lock.
    for (const level of [4, 5, 10]) {
      const decision = registerFailure({ failedAttempts: 0, lockedUntil: null, lockLevel: level }, NOW);
      expect(decision.lockedForMs).toBe(FINAL_LOCK_MS);
    }
  });

  it("walks the whole ladder end to end", () => {
    let state = { ...UNLOCKED };
    const durations: (number | null)[] = [];

    // Three failures for the first lock, then one per lock after it.
    for (const failures of [3, 1, 1, 1]) {
      for (let i = 0; i < failures; i += 1) {
        const decision = registerFailure(state, NOW);
        state = decision;
        if (decision.justLocked) durations.push(decision.lockedForMs);
      }
    }

    expect(durations).toEqual([1 * HOUR, 2 * HOUR, 3 * HOUR, FINAL_LOCK_MS]);
  });
});

describe("the ladder is blind to who is signing in", () => {
  /**
   * There is deliberately no role parameter anywhere in this module: an
   * administrator's password is the most valuable one in the lab, so exempting
   * it would put the weakest limit on the strongest account. This test exists
   * to make any future "but let the admin through" change fail loudly.
   */
  it("takes no account of role — the same call, the same ladder", () => {
    const walk = () => {
      let state = { ...UNLOCKED };
      const locks: (number | null)[] = [];
      for (const failures of [3, 1, 1, 1]) {
        for (let i = 0; i < failures; i += 1) {
          state = registerFailure(state, NOW);
          if ((state as { justLocked?: boolean }).justLocked) {
            locks.push((state as { lockedForMs?: number | null }).lockedForMs ?? null);
          }
        }
      }
      return locks;
    };

    // Whoever the row belongs to, the lock state is the only input there is:
    // registerFailure takes (state, now) and has nowhere to put a role.
    expect(walk()).toEqual([1 * HOUR, 2 * HOUR, 3 * HOUR, FINAL_LOCK_MS]);
  });
});

describe("lockDurationFor", () => {
  it("matches the published ladder", () => {
    expect(lockDurationFor(0)).toBe(LOCK_DURATIONS_MS[0]);
    expect(lockDurationFor(1)).toBe(LOCK_DURATIONS_MS[1]);
    expect(lockDurationFor(2)).toBe(LOCK_DURATIONS_MS[2]);
    expect(lockDurationFor(3)).toBe(FINAL_LOCK_MS);
  });
});

describe("isLocked / lockRemainingMs", () => {
  it("reports a live lock and its remaining time", () => {
    const until = new Date(NOW + 30 * MINUTE).toISOString();
    expect(isLocked({ lockedUntil: until }, NOW)).toBe(true);
    expect(lockRemainingMs(until, NOW)).toBe(30 * MINUTE);
  });

  it("reports an expired lock as unlocked", () => {
    const until = new Date(NOW - MINUTE).toISOString();
    expect(isLocked({ lockedUntil: until }, NOW)).toBe(false);
    expect(lockRemainingMs(until, NOW)).toBe(0);
  });

  it("treats an account that was never locked as unlocked", () => {
    expect(isLocked({ lockedUntil: null }, NOW)).toBe(false);
  });

  it("fails open on an unreadable timestamp rather than stranding the account", () => {
    // Failing closed here could lock someone out with no way back.
    expect(isLocked({ lockedUntil: "not a date" }, NOW)).toBe(false);
  });
});

describe("a correct password", () => {
  it("clears the escalation completely", () => {
    // Getting in proves the account is theirs; holding a bad afternoon
    // against the next one would only punish honest typing.
    const state = registerSuccess();
    expect(state).toEqual(UNLOCKED);
    expect(state.lockLevel).toBe(0);
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil).toBeNull();
  });

  it("means the next bad run starts from three attempts again", () => {
    let state = registerSuccess();
    state = registerFailure(state, NOW);
    state = registerFailure(state, NOW);
    expect(state.lockedUntil).toBeNull();
    const third = registerFailure(state, NOW);
    expect(third.justLocked).toBe(true);
    expect(third.lockedForMs).toBe(1 * HOUR);
  });
});

describe("messages shown to the user", () => {
  it("formats a remaining time in at most two units", () => {
    expect(formatLockRemaining(60 * MINUTE)).toBe("1 soat");
    expect(formatLockRemaining(65 * MINUTE)).toBe("1 soat 5 daqiqa");
    expect(formatLockRemaining(45 * MINUTE)).toBe("45 daqiqa");
    expect(formatLockRemaining(7 * 24 * HOUR)).toBe("7 kun");
    expect(formatLockRemaining(2 * HOUR)).toBe("2 soat");
  });

  it("rounds up, so it never says 0 while still locked", () => {
    expect(formatLockRemaining(30 * 1000)).toBe("1 daqiqa");
    expect(formatLockRemaining(1)).toBe("1 daqiqa");
  });

  it("names the administrator only on the final lock", () => {
    expect(lockMessage(HOUR, false)).not.toMatch(/administrator/i);
    expect(lockMessage(FINAL_LOCK_MS, true)).toMatch(/administrator/i);
    expect(lockMessage(FINAL_LOCK_MS, true)).toMatch(/7 kun/);
  });

  it("counts the remaining attempts out loud from the first mistake", () => {
    // Losing an hour of a shift should never come as a surprise.
    expect(attemptsLeftMessage(2)).toMatch(/2 ta urinish/);
    expect(attemptsLeftMessage(1)).toMatch(/bitta xato/i);
    expect(attemptsLeftMessage(1)).toMatch(/1 soat/);
  });

  it("says nothing once there is nothing left to warn about", () => {
    expect(attemptsLeftMessage(0)).toBeNull();
  });

  it("names the real penalty once past the first lock", () => {
    // From here a single mistake re-locks, and for longer each time, so
    // counting attempts would understate what is at stake.
    expect(attemptsLeftMessage(1, 1)).toMatch(/2 soat/);
    expect(attemptsLeftMessage(1, 2)).toMatch(/3 soat/);
    expect(attemptsLeftMessage(1, 3)).toMatch(/7 kun/);
    expect(attemptsLeftMessage(1, 3)).toMatch(/Diqqat/);
  });
});
