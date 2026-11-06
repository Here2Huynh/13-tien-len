import type { ControllerState } from "../ui/controller.js";
import { enumerateBombs } from "../engine/ai.js";
import { isComebackBomb, bombBeats, bombOnBombBeats } from "../engine/bombs.js";
import { hasComebackTurn } from "../engine/trick.js";
import type { Card } from "../engine/cards.js";
import { HUMAN, cardLabel, sortHand } from "../ui/model.js";
import { els, el } from "./elements.js";
import { refs, markJustDragged, stageScale } from "./fx.js";

// The player's hand (TASK 036 split of main.ts): rendering, card
// selection, the Sort direction, the manual drag order, and the
// bomb highlight sets. All adapter-only state — the engine's hand
// never changes order; selection and play are by card id.

/** What the hand needs from the page that composes it. */
export interface HandHost {
  /** The controller's live state (drag gate, drop re-render). */
  controllerState(): ControllerState;
  /** The state most recently painted (card-click re-render). */
  lastPainted(): ControllerState | null;
  render(state: ControllerState): void;
}

let host: HandHost | null = null;
export function setHandHost(h: HandHost): void {
  host = h;
}
function hostOf(): HandHost {
  return host as HandHost;
}

export const selected = new Set<string>(); // card ids the player has tapped

// Hand display order (adapter-only): dealt ascending; the Sort button
// toggles the rendered order.
let sortAsc = true;

// Manual drag order (adapter-only): card ids in the player's arranged
// order for the current round, or null while the hand follows the sort
// direction. Pinned to one round: a new roundId (TASK 036) means a new
// round, which deals ascending again (resetHandRound).
let orderIds: string[] | null = null;
let lastDisplayIds: string[] = [];

export function resetHandRound(): void {
  orderIds = null;
  sortAsc = true;
}

// Drag state (the mockup's): the card element being dragged, the drag
// origin (adjusted as the card changes slots), and whether the pointer
// has moved past the tap threshold. A finished drag suppresses the
// click that follows it for 250ms so a drop never toggles selection.
interface DragState {
  el: HTMLButtonElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

let dragState: DragState | null = null;
let suppressClickUntil = 0;

// Cards in the human's hand that could jump back in as a comeback
// bomb right now (passed this trick, a bombable 2 or a bomb is on
// top, and a comeback-legal bomb in hand beats it) — the mockup's
// foil set. Pure engine reads; nothing here changes game state.
function comebackHotIds(state: ControllerState): Set<string> {
  const trick = state.trick;
  if (!trick || state.phase !== "playing" || !trick.currentPlay) return new Set();
  if (!hasComebackTurn(trick, HUMAN)) return new Set();
  const hot = new Set<string>();
  for (const bomb of enumerateBombs(trick.hands[HUMAN])) {
    if (
      isComebackBomb(bomb) &&
      (bombBeats(bomb, trick.currentPlay.cards) ||
        bombOnBombBeats(bomb, trick.currentPlay.cards))
    ) {
      bomb.forEach((card) => hot.add(card.id));
    }
  }
  return hot;
}

// Flicker means a bomb can beat the table on this turn, not merely
// that the hand contains a bomb. Keep eligibility in the engine.
function playableBombIds(state: ControllerState): Set<string> {
  const trick = state.trick;
  const ids = new Set<string>();
  if (state.phase !== "playing" || !trick ||
      trick.currentPlayer !== HUMAN || !trick.currentPlay) return ids;
  const passed = trick.passed.includes(HUMAN);
  if (passed && !hasComebackTurn(trick, HUMAN)) return ids;
  for (const bomb of enumerateBombs(trick.hands[HUMAN])) {
    const canAnswer =
      bombBeats(bomb, trick.currentPlay.cards) ||
      bombOnBombBeats(bomb, trick.currentPlay.cards);
    if (canAnswer && (!passed || isComebackBomb(bomb))) {
      bomb.forEach((card) => ids.add(card.id));
    }
  }
  return ids;
}

// Drag-to-rearrange, ported from the mockup: while dragging, the
// dragged card moves to wherever the pointer is in reading order (row
// by row, left to right) — including across the wrap onto another row.
// The dragged DOM node is moved, never recreated, so pointer capture
// on it survives; on drop the manual order is synced from the DOM.
function dragSwap(dragEl: HTMLElement, clientX: number, clientY: number): void {
  if (!dragState) return;
  const cards = Array.from(els.hand.children);
  const from = cards.indexOf(dragEl);
  if (from < 0) return;
  const others = cards.filter((c) => c !== dragEl);
  // Insertion slot among the other cards: the first card the pointer
  // is "before" — above its row, or in its row but left of its centre.
  // Hit-testing uses the other cards' layout positions only, never
  // the dragged card's lifted visual position.
  let target = others.length;
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    if (clientY < r.top) {
      target = i;
      break;
    }
    if (clientY <= r.bottom && clientX < r.left + r.width / 2) {
      target = i;
      break;
    }
  }
  if (target === from) return; // already in that slot — nothing to move
  const before = dragEl.getBoundingClientRect();
  if (target >= others.length) els.hand.appendChild(dragEl);
  else els.hand.insertBefore(dragEl, others[target]);
  // The card's transform is unchanged by the move, so the shift in its
  // rect is the shift in its layout slot: absorb it into the drag
  // origin (both axes, since the slot may now be on a different row)
  // so the card stays glued under the pointer instead of jumping.
  const after = dragEl.getBoundingClientRect();
  dragState.startX += after.left - before.left;
  dragState.startY += after.top - before.top;
}

function attachDragHandlers(btn: HTMLButtonElement): void {
  btn.addEventListener("pointerdown", (ev) => {
    if (hostOf().controllerState().phase !== "playing") return;
    if (ev.button !== undefined && ev.button !== 0) return;
    dragState = {
      el: btn,
      startX: ev.clientX,
      startY: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      active: false,
    };
  });
  btn.addEventListener("pointermove", (ev) => {
    if (!dragState || dragState.el !== btn) return;
    dragState.x = ev.clientX;
    dragState.y = ev.clientY;
    const dx = ev.clientX - dragState.startX;
    const dy = ev.clientY - dragState.startY;
    if (!dragState.active) {
      if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return; // still a tap
      dragState.active = true;
      btn.classList.add("dragging");
      try {
        btn.setPointerCapture(ev.pointerId);
      } catch {
        // No capture available (e.g. a simulated pointer) — drag on.
      }
    }
    dragSwap(btn, ev.clientX, ev.clientY);
    // Pointer deltas are visual pixels; the transform is local
    // (TASK 024 stage zoom) — divide so the card tracks the
    // pointer 1:1 at any stage scale.
    btn.style.transform = `translate(${(dragState.x - dragState.startX) / stageScale()}px, ${(dragState.y - dragState.startY) / stageScale()}px)`;
  });
  const endDrag = () => {
    if (!dragState || dragState.el !== btn) return;
    const wasActive = dragState.active;
    dragState = null;
    btn.classList.remove("dragging");
    btn.style.transform = "";
    if (wasActive) {
      suppressClickUntil = Date.now() + 250;
      // The dropped card was pointer-glued to its slot: it gets no
      // settle FLIP in the render that follows (TASK 014).
      markJustDragged(btn.dataset.cardId ?? null);
      orderIds = Array.from(els.hand.children).map(
        (node) => (node as HTMLElement).dataset.cardId as string,
      );
      hostOf().render(hostOf().controllerState());
    }
  };
  btn.addEventListener("pointerup", endDrag);
  btn.addEventListener("pointercancel", endDrag);
}

// Your hand — rendered in the manual drag order when one exists for
// this round, else in the current sort direction; comeback-bomb
// cards carry the mockup's foil highlight.
export function renderHand(state: ControllerState, myTurn: boolean): void {
  els.youArea.classList.toggle("myturn", Boolean(myTurn));
  // Your own lockout (TASK 014): the hand greys while you're locked
  // out of the trick, same rule as the CPU seats.
  els.youArea.classList.toggle(
    "lockedout",
    state.phase === "playing" &&
      state.trick !== null &&
      state.trick.passed.includes(HUMAN),
  );
  const sortedHand = state.trick ? sortHand(state.trick.hands[HUMAN]) : [];
  let myHand = sortedHand;
  if (orderIds) {
    const byId = new Map(sortedHand.map((card) => [card.id, card]));
    const ordered = orderIds.filter((id) => byId.has(id)).map((id) => byId.get(id) as Card);
    const rest = sortedHand.filter((card) => !orderIds!.includes(card.id));
    myHand = [...ordered, ...rest];
  } else if (!sortAsc) {
    myHand = [...sortedHand].reverse();
  }
  lastDisplayIds = myHand.map((card) => card.id);
  const heldIds = new Set(myHand.map((card) => card.id));
  for (const id of [...selected]) if (!heldIds.has(id)) selected.delete(id);
  els.youHeader.textContent = state.trick
    ? `You — ${myHand.length} cards${myTurn ? " · ● your turn" : ""}`
    : "You";
  const hot = comebackHotIds(state);
  const playableBombs = playableBombIds(state);
  // Reuse card buttons across redraws, matched by card id
  // (TASK 023): a selection change then toggles .sel on the SAME
  // element, so the shared CSS transition glides hover<->selected
  // instead of the pose popping on a fresh node. Buttons for cards
  // that left the hand are removed; DOM order is reconciled by
  // moving only out-of-place buttons. A reused button's click
  // handler re-renders the last painted state — the render-time
  // snapshot it was created under goes stale.
  const prevBtns = refs.handBtns;
  refs.handBtns = new Map();
  const wantedIds = new Set(myHand.map((card) => card.id));
  for (const [id, btn] of prevBtns) {
    if (!wantedIds.has(id)) btn.remove();
  }
  myHand.forEach((card, i) => {
    const label = cardLabel(card);
    const className = `card ${label.color}${selected.has(card.id) ? " sel" : ""}${hot.has(card.id) ? " bombhot" : ""}${playableBombs.has(card.id) ? " bombplayable" : ""}`;
    let btn = prevBtns.get(card.id) as HTMLButtonElement | undefined;
    if (!btn) {
      btn = el("button", className) as HTMLButtonElement;
      btn.type = "button";
      btn.dataset.cardId = card.id;
      btn.append(
        el("span", "r", label.rank),
        el("span", "s", label.glyph),
        el("span", "big", label.glyph),
      );
      btn.addEventListener("click", () => {
        if (Date.now() < suppressClickUntil) return; // a drag just ended — not a tap
        if (selected.has(card.id)) selected.delete(card.id);
        else selected.add(card.id);
        hostOf().render(hostOf().lastPainted() ?? hostOf().controllerState());
      });
      attachDragHandlers(btn);
    } else {
      btn.className = className;
    }
    btn.disabled = !myTurn;
    const at = els.hand.children[i];
    if (at !== btn) {
      if (at) els.hand.insertBefore(btn, at);
      else els.hand.appendChild(btn);
    }
    refs.handBtns.set(card.id, btn);
  });
}

// The Sort toggle's label, title, and arrow track the current
// direction — the mockup's exact strings (TASK 041, audit #18: the
// descending aria-label's "tap to sort" half now names the direction
// the tap actually goes, low to high, as the title always did).
export function updateSortButton(): void {
  els.sortBtn.setAttribute(
    "aria-label",
    sortAsc
      ? "Sort hand low to high ascending, tap to sort high to low descending"
      : "Sort hand high to low descending, tap to sort low to high ascending",
  );
  els.sortBtn.title = sortAsc
    ? "Sorted low to high (ascending) — tap to sort high to low (descending)"
    : "Sorted high to low (descending) — tap to sort low to high (ascending)";
  for (const child of els.sortBtn.children) {
    if (child.className === "sort-arrow") child.textContent = sortAsc ? "↑" : "↓";
  }
}

// The Sort click (the mockup's semantics): direction derives from
// the hand's actual order — ascending flips to descending,
// descending to ascending, and a manually dragged order first
// restores ascending. The caller re-renders.
export function toggleSort(hand: Card[]): void {
  const ascIds = sortHand(hand).map((c) => c.id);
  const isAsc =
    lastDisplayIds.length === ascIds.length &&
    lastDisplayIds.every((id, i) => id === ascIds[i]);
  sortAsc = !isAsc;
  orderIds = null; // Sort overrides any manual drag order
}
