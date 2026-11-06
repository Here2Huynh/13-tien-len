import { els } from "./elements.js";
import { createModal } from "./dialog.js";

// New Match confirmation (TASK 040, audit #9). Activating New Match
// while a match is in progress opens this dialog instead of wiping
// the match on one tap. It is the shared .overlay/.modal shell (the
// start gate / banner family) with dialog semantics: role="dialog",
// aria-modal, labelled by its title; Escape, the backdrop and Keep
// playing all cancel; focus starts on Keep playing (the safe choice)
// and returns to the control that opened it.
//
// Frozen behind it: while the dialog is up the game does not move.
//   - CPU turns: the controller schedules them through
//     holdingSchedule below. A CPU timer that comes due while the
//     dialog is open is HELD instead of run; closing the dialog
//     (either way) re-arms each held turn with its full delay, so
//     play resumes with the same watchable pause it always had.
//     With the dialog never opened, holdingSchedule is a plain
//     setTimeout pass-through — same moves, same order.
//   - Human input: EVERYTHING behind the dialog is made inert — the
//     table (.wrap#app) and every sibling overlay outside it (the
//     round banner, help, odds, start gate, the lazily-appended
//     instant-win beat and fx layer): every top-level <body> child
//     except #confirm-overlay. Neither pointer nor keyboard (Tab,
//     Enter, Space) can reach a control behind it — e.g. the round
//     banner's Continue (VERIFY-040 FAIL: it used to be only #app).
//     Anything appended to <body> while the dialog is up is made
//     inert as it lands. Closing restores exactly what opening
//     changed: only elements this dialog made inert are released.
// Pure presentation otherwise: opening and cancelling never call the
// controller and never render; the stored save is never touched.

// TASK 041: the dialog plumbing above (inert background, late
// arrivals, focus in and back, Escape) now lives in dialog.ts, shared
// with How to play and Bomb odds; this module keeps what is the
// confirmation's own — the CPU-turn hold and its two actions.
let held: { fn: () => void; ms: number }[] = [];
let onConfirm: (() => void) | null = null;
const dialog = createModal(els.confirmOverlay, cancel);

export function confirmOpen(): boolean {
  return !els.confirmOverlay.hidden;
}

/** The controller's CPU-turn scheduler (main.ts passes it in). */
export function holdingSchedule(fn: () => void, ms: number): unknown {
  return setTimeout(() => {
    if (confirmOpen()) held.push({ fn, ms });
    else fn();
  }, ms);
}

/** Open the dialog over a match in progress. `standing` is the
    match's round + standings line; `from` gets focus back on close. */
export function openConfirm(standing: string, from: HTMLElement): void {
  els.confirmStanding.textContent = standing;
  dialog.open(els.confirmCancel, from);
}

function closeConfirm(): void {
  // Hide, release the background, focus back to the opener.
  dialog.close();
  // Re-arm any CPU turn that came due while the dialog was up. On
  // Confirm this runs before the fresh deal is made (synchronously,
  // below) but the re-armed timers fire after it — exactly as a CPU
  // timer still pending at a one-tap New Match always did.
  const due = held;
  held = [];
  for (const { fn, ms } of due) holdingSchedule(fn, ms);
}

function cancel(): void {
  if (confirmOpen()) closeConfirm();
}

/** Wire the dialog's controls. `confirm` starts the fresh match. */
export function wireConfirm(confirm: () => void): void {
  onConfirm = confirm;
  els.confirmOverlay.hidden = true;
  els.confirmCancel.addEventListener("click", cancel);
  els.confirmNew.addEventListener("click", () => {
    if (!confirmOpen()) return;
    closeConfirm();
    onConfirm?.();
  });
  els.confirmOverlay.addEventListener("click", (event) => {
    if (event.target === els.confirmOverlay) cancel();
  });
  // Escape cancels too — through dialog.ts's one Escape listener.
}
