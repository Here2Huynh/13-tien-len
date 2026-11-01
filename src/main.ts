import { createController, type ControllerState } from "./ui/controller.js";
import { enumerateBombs } from "./engine/ai.js";
import { isComebackBomb, bombBeats } from "./engine/bombs.js";
import { hasComebackTurn, type TrickPlay, type TrickState } from "./engine/trick.js";
import type { Card } from "./engine/cards.js";
import {
  SEAT_NAMES,
  HUMAN,
  cardLabel,
  sortHand,
  describePlay,
  penaltyLine,
  roundResultRows,
} from "./ui/model.js";

// Thin DOM adapter over the game controller. All flow and rules live
// in the controller/engine; this file only renders state and forwards
// clicks.

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const $btn = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
const els = {
  scores: $("scores"),
  seats: { 1: $("seat-1"), 2: $("seat-2"), 3: $("seat-3") } as Record<number, HTMLElement>,
  trickInfo: $("trick-info"),
  toBeat: $("to-beat"),
  message: $("message"),
  youArea: $("you-area"),
  youHeader: $("you-header"),
  hand: $("hand"),
  playBtn: $btn("play-btn"),
  passBtn: $btn("pass-btn"),
  hintBtn: $btn("hint-btn"),
  log: $("log"),
  banner: $("banner"),
  bannerTitle: $("banner-title"),
  bannerBody: $("banner-body"),
  continueBtn: $btn("continue-btn"),
  newMatchBtn: $btn("new-match-btn"),
  startScreen: $("start-screen"),
  startBtn: $btn("start-btn"),
  roundNum: $("round-num"),
  newMatchTop: $btn("new-match-top"),
  sortBtn: $btn("sort-btn"),
  clearBtn: $btn("clear-btn"),
};

const selected = new Set<string>(); // card ids the player has tapped

// Hand display order (adapter-only): dealt ascending; the Sort button
// toggles the rendered order. The engine's hand never changes order —
// selection and play are by card id.
let sortAsc = true;

// Manual drag order (adapter-only): card ids in the player's arranged
// order for the current round, or null while the hand follows the sort
// direction. orderTrick pins it to one round — a new trick state
// object means a new round, which deals ascending again.
let orderIds: string[] | null = null;
let orderTrick: TrickState | null = null;
let lastDisplayIds: string[] = [];

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

// The pile's "Before that" line: the trick state exposes only the
// current play, so the adapter remembers the play it replaced,
// watching successive renders. Reset when the trick clears or turns
// over to a new round.
type PlayRecord = { player: number; cards: Card[] };

let lastPlay: PlayRecord | null = null;
let prevPlay: PlayRecord | null = null;
let lastPlayKey: string | null = null;

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

const controller = createController({ onChange: render });

function el(tag: string, className?: string | null, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function miniCard(card: Card): HTMLElement {
  const label = cardLabel(card);
  const node = el("div", `card mini ${label.color}`);
  node.append(el("span", "r", label.rank), el("span", "s", label.glyph));
  return node;
}

// Mockup seat presentation: name + cards-left count, a status line,
// and one card back per card held (side seats stack them vertically
// via CSS). Played cards live in the center pile, as in the mockup.
function renderSeat(player: number, state: ControllerState): void {
  const box = els.seats[player];
  box.textContent = "";
  const trick = state.trick;
  const active =
    state.phase === "playing" && trick && trick.currentPlayer === player;
  const finishIdx = trick ? trick.finishOrder.indexOf(player) : -1;
  const count = trick ? trick.hands[player].length : 0;
  const opp = el("div", `opp${active ? " active" : ""}`);
  const who = el("div", "who");
  who.append(
    document.createTextNode(`${SEAT_NAMES[player]} · `),
    el("span", "cnt", `${count}`),
    document.createTextNode(" cards"),
  );
  opp.append(who);
  const entry = state.trickView.entries[player];
  let status = "";
  if (finishIdx >= 0) status = `Out — ${ORDINALS[finishIdx]}`;
  else if (active) status = "Thinking…";
  else if (entry?.type === "pass") status = "Passed this trick";
  opp.append(el("div", "status", status));
  const backs = el("div", "backs");
  if (finishIdx < 0) for (let i = 0; i < count; i++) backs.append(el("div", "back"));
  opp.append(backs);
  box.append(opp);
}

// Cards in the human's hand that could jump back in as a comeback
// bomb right now (passed this trick, a bombable 2 is on top, and a
// comeback-legal bomb in hand beats it) — the mockup's foil set.
// Pure engine reads; nothing here changes game state.
function comebackHotIds(state: ControllerState): Set<string> {
  const trick = state.trick;
  if (!trick || state.phase !== "playing" || !trick.currentPlay) return new Set();
  if (!hasComebackTurn(trick, HUMAN)) return new Set();
  const hot = new Set<string>();
  for (const bomb of enumerateBombs(trick.hands[HUMAN])) {
    if (isComebackBomb(bomb) && bombBeats(bomb, trick.currentPlay.cards)) {
      bomb.forEach((card) => hot.add(card.id));
    }
  }
  return hot;
}

function renderBanner(state: ControllerState): void {
  const summary = state.roundSummary;
  if ((state.phase !== "roundEnd" && state.phase !== "matchEnd") || !summary) {
    els.banner.hidden = true;
    return;
  }
  els.banner.hidden = false;
  const body = els.bannerBody;
  body.textContent = "";
  if (summary.instantWin) {
    const { winner, kind } = summary.instantWin;
    els.bannerTitle.textContent =
      state.phase === "matchEnd" ? "Match over!" : "Instant win!";
    body.append(
      el(
        "p",
        "note",
        `${SEAT_NAMES[winner]} was dealt an instant-win hand (${kind.replaceAll("-", " ")}). Everyone else pays 2.`,
      ),
    );
  } else if (state.phase === "matchEnd") {
    els.bannerTitle.textContent = `🏆 ${SEAT_NAMES[summary.matchWinner as number]} wins the match!`;
  } else {
    els.bannerTitle.textContent = "Round over";
  }
  const table = el("table");
  const rows = summary.instantWin
    ? [0, 1, 2, 3].map((player) => ({
        player,
        name: SEAT_NAMES[player],
        place: player === (summary.instantWin as { winner: number }).winner ? "★" : "",
        delta: summary.deltas[player],
      }))
    : roundResultRows(summary.finishOrder, summary.deltas);
  for (const row of rows) {
    const tr = el("tr");
    tr.append(
      el("td", null, row.place ? `${row.place} ${row.name}` : row.name),
      el("td", null, `score ${summary.scores[row.player]}`),
    );
    const delta = el(
      "td",
      `delta ${row.delta > 0 ? "pos" : row.delta < 0 ? "neg" : ""}`,
      row.delta > 0 ? `+${row.delta}` : `${row.delta}`,
    );
    tr.append(delta);
    table.append(tr);
  }
  body.append(table);
  for (const penalty of summary.penalties) {
    body.append(el("p", "note", penaltyLine(penalty)));
  }
  els.continueBtn.hidden = state.phase === "matchEnd";
  els.newMatchBtn.hidden = state.phase !== "matchEnd";
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
    if (controller.state.phase !== "playing") return;
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
    btn.style.transform = `translate(${dragState.x - dragState.startX}px, ${dragState.y - dragState.startY}px)`;
  });
  const endDrag = () => {
    if (!dragState || dragState.el !== btn) return;
    const wasActive = dragState.active;
    dragState = null;
    btn.classList.remove("dragging");
    btn.style.transform = "";
    if (wasActive) {
      suppressClickUntil = Date.now() + 250;
      orderIds = Array.from(els.hand.children).map(
        (node) => (node as HTMLElement).dataset.cardId as string,
      );
      render(controller.state);
    }
  };
  btn.addEventListener("pointerup", endDrag);
  btn.addEventListener("pointercancel", endDrag);
}

function renderScoreboard(state: ControllerState): void {
  els.roundNum.textContent = `${state.match ? state.match.roundNumber : 1}`;
  els.scores.textContent = "";
  const scores = state.match ? state.match.scores : [0, 0, 0, 0];
  const trick = state.trick;
  for (const player of [0, 1, 2, 3]) {
    const isTurn =
      state.phase === "playing" && trick && trick.currentPlayer === player;
    const finishIdx = trick ? trick.finishOrder.indexOf(player) : -1;
    const box = el(
      "div",
      `score${isTurn ? " turn" : ""}${finishIdx >= 0 ? " fin" : ""}`,
    );
    const nm = el("div", "nm");
    nm.append(el("span", null, SEAT_NAMES[player]));
    if (finishIdx >= 0) nm.append(el("span", "badge done", ORDINALS[finishIdx]));
    else if (trick?.currentPlay && state.trickView.entries[player]?.type === "pass")
      nm.append(el("span", "badge pass", "Passed"));
    box.append(nm);
    box.append(el("div", "pts", `${scores[player]}`));
    const meta = !trick
      ? "Not dealt yet"
      : finishIdx >= 0
        ? `Finished ${ORDINALS[finishIdx]}`
        : `${trick.hands[player].length} cards left`;
    box.append(el("div", "meta", meta));
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${Math.max(0, Math.min(100, (scores[player] / 13) * 100))}%`;
    bar.append(fill);
    box.append(bar);
    els.scores.append(box);
  }
}

function render(state: ControllerState): void {
  // A new trick state object = a new round: the manual drag order and
  // the pile's previous-play tracking reset; the deal is ascending.
  if (state.trick !== orderTrick) {
    orderTrick = state.trick;
    orderIds = null;
    sortAsc = true;
    lastPlay = null;
    prevPlay = null;
    lastPlayKey = null;
  }

  // Score board — always visible.
  renderScoreboard(state);

  for (const player of [1, 2, 3]) renderSeat(player, state);

  const myTurn =
    state.phase === "playing" && state.trick && state.trick.currentPlayer === HUMAN;

  // Center: the pile (play to beat) + the turn banner under it.
  if (state.phase === "playing" && state.trick) {
    els.trickInfo.textContent = myTurn
      ? `Trick ${state.trick.trickNumber} — your turn`
      : `Trick ${state.trick.trickNumber} — ${SEAT_NAMES[state.trick.currentPlayer]} to play`;
    els.toBeat.textContent = "";
    if (state.trick.currentPlay) {
      const cp: TrickPlay = state.trick.currentPlay;
      const key = `${cp.player}:${cp.cards.map((c) => c.id).join(",")}`;
      if (key !== lastPlayKey) {
        prevPlay = lastPlay;
        lastPlay = { player: cp.player, cards: cp.cards };
        lastPlayKey = key;
      }
      const line = el("div", "leadline");
      const desc = el("b", null, describePlay(cp.cards));
      const by = el("b", null, SEAT_NAMES[cp.player]);
      line.append(document.createTextNode("To beat: "), desc, document.createTextNode(" · played by "), by);
      const cards = el("div", "minicards");
      cp.cards.forEach((card) => cards.append(miniCard(card)));
      els.toBeat.append(line, cards);
      if (prevPlay) {
        const before = el(
          "div",
          "leadline",
          `Before that: ${SEAT_NAMES[prevPlay.player]} — ${describePlay(prevPlay.cards)}`,
        );
        before.style.opacity = ".65";
        els.toBeat.append(before);
      }
    } else {
      lastPlay = null;
      prevPlay = null;
      lastPlayKey = null;
      els.toBeat.append(el("div", "empty", "New trick — anything goes"));
    }
  } else {
    els.trickInfo.textContent = state.phase === "idle" ? "Waiting to start" : "Round complete";
    els.toBeat.textContent = "";
    els.toBeat.append(
      el("div", "empty", state.phase === "idle" ? "Waiting to start" : "Round over"),
    );
  }
  els.message.textContent = state.message;

  // Your hand — rendered in the manual drag order when one exists for
  // this round, else in the current sort direction; comeback-bomb
  // cards carry the mockup's foil highlight.
  els.youArea.classList.toggle("myturn", Boolean(myTurn));
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
  els.hand.textContent = "";
  for (const card of myHand) {
    const label = cardLabel(card);
    const btn = el(
      "button",
      `card ${label.color}${selected.has(card.id) ? " sel" : ""}${hot.has(card.id) ? " bombhot" : ""}`,
    ) as HTMLButtonElement;
    btn.type = "button";
    btn.dataset.cardId = card.id;
    btn.disabled = !myTurn;
    btn.append(
      el("span", "r", label.rank),
      el("span", "s", label.glyph),
      el("span", "big", label.glyph),
    );
    btn.addEventListener("click", () => {
      if (Date.now() < suppressClickUntil) return; // a drag just ended — not a tap
      if (selected.has(card.id)) selected.delete(card.id);
      else selected.add(card.id);
      render(state);
    });
    attachDragHandlers(btn);
    els.hand.append(btn);
  }

  els.playBtn.disabled = !myTurn;
  els.passBtn.disabled = !myTurn;
  els.hintBtn.disabled = !myTurn;

  // Log.
  els.log.textContent = "";
  for (const line of state.log) els.log.append(el("li", null, line));
  els.log.scrollTop = els.log.scrollHeight;

  // Start gate: the start screen covers the table until the first
  // match is started; it never comes back (New Match goes straight in).
  els.startScreen.hidden = state.phase !== "idle";

  updateSortButton();

  renderBanner(state);
}

// The Sort toggle's label, title, and arrow track the current
// direction — the mockup's exact strings.
function updateSortButton(): void {
  els.sortBtn.setAttribute(
    "aria-label",
    sortAsc
      ? "Sort hand low to high ascending, tap to sort high to low descending"
      : "Sort hand high to low descending, tap to sort high to low ascending",
  );
  els.sortBtn.title = sortAsc
    ? "Sorted low to high (ascending) — tap to sort high to low (descending)"
    : "Sorted high to low (descending) — tap to sort low to high (ascending)";
  for (const child of els.sortBtn.children) {
    if (child.className === "sort-arrow") child.textContent = sortAsc ? "↑" : "↓";
  }
}

els.playBtn.addEventListener("click", () => {
  const hand = controller.state.trick?.hands[HUMAN] ?? [];
  const cards = hand.filter((card) => selected.has(card.id));
  if (controller.humanPlay(cards)) selected.clear();
});

els.passBtn.addEventListener("click", () => {
  controller.humanPass();
});

els.hintBtn.addEventListener("click", () => {
  const action = controller.hint();
  if (!action) return;
  if (action.type === "pass") {
    controller.setMessage("Hint: pass — nothing beats it.");
  } else {
    selected.clear();
    action.cards.forEach((card) => selected.add(card.id));
    controller.setMessage(`Hint: play ${describePlay(action.cards)}.`);
  }
});

els.continueBtn.addEventListener("click", () => controller.continueRound());
els.newMatchBtn.addEventListener("click", () => controller.newMatch());
els.newMatchTop.addEventListener("click", () => controller.newMatch());
els.startBtn.addEventListener("click", () => controller.newMatch());

els.sortBtn.addEventListener("click", () => {
  if (!controller.state.trick) return;
  // The mockup's semantics: direction derives from the hand's actual
  // order — ascending flips to descending, descending to ascending,
  // and a manually dragged order first restores ascending.
  const ascIds = sortHand(controller.state.trick.hands[HUMAN]).map((c) => c.id);
  const isAsc =
    lastDisplayIds.length === ascIds.length &&
    lastDisplayIds.every((id, i) => id === ascIds[i]);
  sortAsc = !isAsc;
  orderIds = null; // Sort overrides any manual drag order
  render(controller.state);
});

els.clearBtn.addEventListener("click", () => {
  selected.clear();
  render(controller.state);
});

// No auto-start: paint the idle state (start screen up, nothing dealt)
// and wait for the Start Game click.
render(controller.state);
