/** True when running on macOS (including Safari on iPad requesting desktop). */
export const isMac =
  typeof navigator !== 'undefined' &&
  /mac/i.test(navigator.platform || navigator.userAgent);

/** Primary modifier key symbol for the current OS. */
export const mod = isMac ? '⌘' : 'Ctrl+';

/** Shift key symbol (same visually on both platforms). */
export const shift = isMac ? '⇧' : 'Shift+';

/** Enter key symbol for the current OS. */
export const enter = isMac ? '↵' : 'Enter';
