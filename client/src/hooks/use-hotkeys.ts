import { useEffect } from "react";

/**
 * Application-wide keyboard shortcuts.
 *
 * Two rules make the difference between a shortcut that helps and one that
 * gets in the way:
 *
 *  - A shortcut never fires while the user is typing into a field, unless it
 *    is modifier-based. Otherwise "n" would open a dialog mid-way through a
 *    patient's surname.
 *  - preventDefault is called only for combinations actually handled here, so
 *    the browser's own shortcuts keep working.
 */

export type Hotkey = {
  /** Lower-case key name as reported by KeyboardEvent.key — "k", "n", "/". */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
};

/** True while focus sits somewhere text is being entered. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // A key repeat means the key is being held; the action already ran.
      if (e.repeat) return;

      const key = e.key.toLowerCase();
      // Ctrl and Cmd are treated as the same modifier so the same shortcut
      // works on Windows and on a Mac without a second binding.
      const ctrl = e.ctrlKey || e.metaKey;

      for (const hotkey of hotkeys) {
        if (key !== hotkey.key) continue;
        if (Boolean(hotkey.ctrl) !== ctrl) continue;
        if (Boolean(hotkey.shift) !== e.shiftKey) continue;
        // An unmodified letter must not steal a keystroke from a form field.
        if (!hotkey.ctrl && isTyping(e.target)) continue;

        e.preventDefault();
        hotkey.handler();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys, enabled]);
}
