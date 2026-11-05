// Modal dialog plumbing (TASK 041, audit #18), extracted unchanged
// from the TASK 040 New Match confirmation so every overlay dialog —
// the confirmation, How to play, Bomb odds — shares ONE focus/overlay
// system instead of growing a second one:
//   - open: the overlay shows, everything behind it is made inert
//     (the table .wrap#app and every top-level <body> child except
//     this overlay — late arrivals too, as they land), and focus
//     moves to the control the caller names, inside the dialog.
//   - close: the overlay hides, exactly what opening made inert is
//     released (and nothing else), and focus returns to the opener.
//   - Escape dismisses the topmost open dialog only, through that
//     dialog's own dismiss path (one document listener for all).
// The dialog semantics themselves (role="dialog", aria-modal,
// aria-labelledby) live on each modal's markup in index.html.
// Pure presentation: no controller call, no render, no timers.

import { els } from "./elements.js";

export interface ModalDialog {
  isOpen(): boolean;
  /** Show it; `focusTo` gets focus, `from` gets it back on close. */
  open(focusTo: HTMLElement, from: HTMLElement | null): void;
  /** Hide it, release the background, return focus to the opener. */
  close(): void;
}

interface Entry {
  dialog: ModalDialog;
  dismiss: () => void;
}

// Open dialogs, oldest first; Escape goes to the last one still open.
let stack: Entry[] = [];
let escapeWired = false;

function wireEscape(): void {
  if (escapeWired) return;
  escapeWired = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].dialog.isOpen()) {
        stack[i].dismiss();
        return;
      }
    }
  });
}

/** A modal dialog over `overlay`. `dismiss` is its cancel path
    (Escape calls it); it must end by calling close(). */
export function createModal(overlay: HTMLElement, dismiss: () => void): ModalDialog {
  // The elements this dialog made inert (and only those), plus the
  // watcher that freezes late arrivals while it is open.
  let frozen: HTMLElement[] = [];
  let lateWatch: MutationObserver | null = null;
  let returnFocus: HTMLElement | null = null;

  function freeze(node: Element): void {
    const el = node as HTMLElement;
    if (el === overlay || el.inert) return;
    el.inert = true;
    frozen.push(el);
  }

  function freezeBackground(): void {
    lateWatch?.disconnect();
    freeze(els.app);
    for (const child of Array.from(document.body.children)) freeze(child);
    if (typeof MutationObserver === "undefined") return;
    lateWatch = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType === 1) freeze(node as Element);
        }
      }
    });
    lateWatch.observe(document.body, { childList: true });
  }

  function releaseBackground(): void {
    lateWatch?.disconnect();
    lateWatch = null;
    for (const el of frozen) el.inert = false;
    frozen = [];
  }

  const dialog: ModalDialog = {
    isOpen: () => !overlay.hidden,
    open(focusTo, from) {
      returnFocus = from;
      overlay.hidden = false;
      freezeBackground();
      stack = [...stack.filter((entry) => entry.dialog !== dialog), { dialog, dismiss }];
      focusTo.focus();
    },
    close() {
      overlay.hidden = true;
      releaseBackground();
      stack = stack.filter((entry) => entry.dialog !== dialog);
      returnFocus?.focus();
      returnFocus = null;
    },
  };
  wireEscape();
  return dialog;
}
