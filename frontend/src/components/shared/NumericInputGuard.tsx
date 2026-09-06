"use client";

import { useEffect } from "react";

/**
 * `<input type="number">` accepts `e`, `E` and `+` because the HTML number type
 * is specified in terms of scientific notation. Nobody enters `2e3` grams of
 * shrimp. What actually happens is that a stray keystroke turns a valid amount
 * into one the field cannot represent, and the browser then reports the input as
 * EMPTY rather than as wrong — so the number disappears on save with no error to
 * explain it.
 *
 * The listener sits on the document in the capture phase rather than on each
 * input, so it covers every number field on every page, including fields added
 * later by someone who never reads this file.
 *
 * `-` is deliberately still allowed: it is a legitimate leading character for a
 * signed value, and blocking it here would silently break any field that ever
 * needs one.
 */
const BLOCKED_KEYS = new Set(["e", "E", "+"]);

export default function NumericInputGuard() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!BLOCKED_KEYS.has(event.key)) return;
      // A modifier means this is a shortcut (Ctrl+E and friends), not typing.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
