/**
 * Dismissal of the boot splash that index.html paints before this bundle
 * exists. React owns the *end* of that animation: the splash stays up until
 * the app actually knows who the user is, so a refresh is one uninterrupted
 * shot rather than splash -> blank -> spinner -> app.
 */

/**
 * A splash that flashes past in 80ms reads as a glitch, not as polish, so it
 * is held for at least one full turn of the orbit even on a warm cache.
 */
const MIN_VISIBLE_MS = 400;

/** Must match the transition duration on #boot-splash in index.html. */
const FADE_MS = 280;

let dismissed = false;

export function hideBootSplash(): void {
  if (dismissed) return;
  dismissed = true;

  const el = document.getElementById("boot-splash");
  if (!el) return;

  // performance.now() is milliseconds since navigation started, which is
  // near enough to when the splash first painted.
  const remaining = Math.max(0, MIN_VISIBLE_MS - performance.now());

  window.setTimeout(() => {
    el.classList.add("boot-splash-done");
    window.setTimeout(() => el.remove(), FADE_MS);
  }, remaining);
}
