import { createController, type ControllerState } from "./ui/controller.js";
import { enumerateBombs } from "./engine/ai.js";
import { isComebackBomb, bombBeats, detectBomb, bombTarget } from "./engine/bombs.js";
import { hasComebackTurn, type TrickPlay, type TrickState } from "./engine/trick.js";
import type { Match } from "./engine/match.js";
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
  helpTop: $btn("help-btn-top"),
  helpStart: $btn("help-btn-start"),
  helpOverlay: $("help-overlay"),
  helpClose: $btn("help-close"),
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

// ---- Animation layer (TASK 014) ------------------------------------
// Pure presentation over the render cycle: beginFx snapshots the
// pre-render layout (from the element refs the last render left
// behind) plus the adapter's scalar trackers; endFx compares and
// fires WAAPI motion. Transform/opacity only, fire-and-forget —
// animations never gate input or timers, in-flight ones are
// cancelled at the next render, and the final DOM is identical with
// motion on or off. prefers-reduced-motion disables everything.

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FxBegin {
  handRects: Map<string, RectLike>;
  pileRects: Map<string, RectLike>;
  pileMinis: Map<string, HTMLElement>;
  scores: number[] | null;
  trickRef: TrickState | null;
  trickNumber: number;
  passed: number[];
  playKey: string | null;
}

let lastHandBtns = new Map<string, HTMLElement>();
let lastPileMinis = new Map<string, HTMLElement>();
let lastScoreBoxes: (HTMLElement | undefined)[] = [];
let fxScores: number[] | null = null;
let fxMatchRef: Match | null = null;
let fxTrickRef: TrickState | null = null;
let fxTrickNumber = 0;
let fxPassed: number[] = [];
let justDraggedId: string | null = null;
const liveAnims = new Set<Animation>();

function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animate(
  node: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (!motionAllowed()) return;
  try {
    const anim = node.animate(keyframes, options);
    liveAnims.add(anim);
    anim.onfinish = () => liveAnims.delete(anim);
  } catch {
    // No WAAPI (very old browser): the state simply lands.
  }
}

function rectOf(node: HTMLElement): RectLike {
  const r = node.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function beginFx(): FxBegin {
  // A new render supersedes any in-flight motion: cancel back to
  // the elements' natural (final) state before measuring.
  for (const anim of liveAnims) {
    try {
      anim.cancel();
    } catch {
      // Already finished — nothing to cancel.
    }
  }
  liveAnims.clear();
  const handRects = new Map<string, RectLike>();
  for (const [id, btn] of lastHandBtns) handRects.set(id, rectOf(btn));
  const pileRects = new Map<string, RectLike>();
  for (const [id, mini] of lastPileMinis) pileRects.set(id, rectOf(mini));
  return {
    handRects,
    pileRects,
    pileMinis: lastPileMinis,
    scores: fxScores,
    trickRef: fxTrickRef,
    trickNumber: fxTrickNumber,
    passed: fxPassed,
    playKey: lastPlayKey,
  };
}

let fxLayer: HTMLElement | null = null;
function getFxLayer(): HTMLElement | null {
  if (fxLayer) return fxLayer;
  if (!document.body) return null;
  fxLayer = el("div", "fx-layer");
  document.body.append(fxLayer);
  return fxLayer;
}

// A floating "−N" that travels from the payer's score box to the
// bomber's when a bomb penalty lands (TASK 014). Lives in the fx
// layer; its own lifecycle, never tracked or cancelled by renders.
function floatChop(payer: number, payee: number, points: number): void {
  if (!motionAllowed()) return;
  const layer = getFxLayer();
  const fromBox = lastScoreBoxes[payer];
  const toBox = lastScoreBoxes[payee];
  if (!layer || !fromBox || !toBox) return;
  const from = rectOf(fromBox);
  const to = rectOf(toBox);
  const node = el("div", "fx-float", `−${points}`);
  node.style.left = `${from.left + from.width / 2}px`;
  node.style.top = `${from.top + from.height / 2}px`;
  layer.append(node);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  try {
    const anim = node.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.25)`,
          opacity: 1,
          offset: 0.78,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.25)`,
          opacity: 0,
        },
      ],
      { duration: 720, easing: "ease-in-out" },
    );
    anim.onfinish = () => node.remove();
  } catch {
    node.remove();
    return;
  }
  setTimeout(() => node.remove(), 1400); // belt-and-braces cleanup
}

// When a trick clears, the pile's cards glide to the winner's seat
// and fade (TASK 014): clones of the just-replaced minis, animated
// from their last layout rects. Browser-only (needs cloneNode and a
// body layer); the pile itself is already in its final state.
function collectGhost(fx: FxBegin, winner: number): void {
  if (!motionAllowed()) return;
  const layer = getFxLayer();
  if (!layer) return;
  const target = winner === HUMAN ? els.youArea : els.seats[winner];
  if (!target) return;
  const t = rectOf(target);
  const tcx = t.left + t.width / 2;
  const tcy = t.top + t.height / 2;
  for (const [id, mini] of fx.pileMinis) {
    const r = fx.pileRects.get(id);
    if (!r || typeof mini.cloneNode !== "function") continue;
    const ghost = mini.cloneNode(true) as HTMLElement;
    ghost.classList.add("fx-ghostcard");
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    ghost.style.margin = "0";
    layer.append(ghost);
    const dx = tcx - (r.left + r.width / 2);
    const dy = tcy - (r.top + r.height / 2);
    try {
      const anim = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 },
        ],
        { duration: 460, easing: "cubic-bezier(.3,.7,.4,1)" },
      );
      anim.onfinish = () => ghost.remove();
    } catch {
      ghost.remove();
      continue;
    }
    setTimeout(() => ghost.remove(), 1200);
  }
}

const DEAL_FRAMES: Keyframe[] = [
  { transform: "translateY(-18px) scale(.94)", opacity: 0 },
  { transform: "translateY(0) scale(1)", opacity: 1 },
];

function endFx(fx: FxBegin, state: ControllerState): void {
  const trick = state.trick;
  try {
    if (!motionAllowed()) return;

    // Deal: a new trick state object is a new round. Seats settle
    // in turn order from the leader — CPU stacks as units, the
    // human hand card by card — all inside ~1s.
    if (trick && fx.trickRef !== trick && state.phase === "playing") {
      const leader = trick.leader ?? trick.currentPlayer;
      for (let step = 0; step < 4; step++) {
        const player = (leader + step) % 4;
        if (player === HUMAN) {
          Array.from(els.hand.children).forEach((btn, i) => {
            animate(btn as HTMLElement, DEAL_FRAMES, {
              duration: 280,
              delay: step * 70 + i * 18,
              easing: "cubic-bezier(.2,.9,.3,1.12)",
              fill: "backwards",
            });
          });
        } else {
          animate(els.seats[player], DEAL_FRAMES, {
            duration: 300,
            delay: step * 70,
            easing: "cubic-bezier(.2,.9,.3,1.12)",
            fill: "backwards",
          });
        }
      }
    }

    // A play landed: FLIP the pile's minis in from where the cards
    // came from (the human hand, or the CPU seat), and pulse the
    // pile when the play functioned as a bomb.
    if (trick?.currentPlay && fx.playKey !== lastPlayKey) {
      const cp = trick.currentPlay;
      const seatRect = rectOf(els.seats[cp.player] ?? els.youArea);
      for (const [id, mini] of lastPileMinis) {
        const src =
          fx.handRects.get(id) ?? (cp.player !== HUMAN ? seatRect : undefined);
        if (!src) continue;
        const dst = rectOf(mini);
        animate(mini, [
          {
            transform: `translate(${src.left - dst.left}px, ${src.top - dst.top}px) scale(1.05)`,
            opacity: 0.85,
          },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ], { duration: 320, easing: "cubic-bezier(.25,.9,.3,1.18)" });
      }
      const wasBomb =
        prevPlay !== null &&
        bombTarget(prevPlay.cards) !== null &&
        detectBomb(cp.cards) !== null;
      if (wasBomb) {
        animate(els.toBeat, [
          { transform: "scale(1)" },
          { transform: "scale(1.055)", offset: 0.4 },
          { transform: "scale(1)" },
        ], { duration: 380, easing: "ease-out" });
      }
    }

    // Hand settle: cards whose layout slot moved (sort, drag
    // settle, reflow after a play) glide to their new positions.
    // The just-dragged card is excluded — it was pointer-glued.
    // Same-trick only: hand rects are per-round layout state, and
    // on a trick change the deal stagger owns all card motion.
    if (fx.trickRef === trick) {
      for (const [id, btn] of lastHandBtns) {
        if (id === justDraggedId) continue;
        const pre = fx.handRects.get(id);
        if (!pre) continue;
        const post = rectOf(btn);
        const dx = pre.left - post.left;
        const dy = pre.top - post.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        animate(btn, [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ], { duration: 260, easing: "cubic-bezier(.25,.9,.3,1.15)" });
      }
    }

    // Pass flash: seats that newly locked out shake/flash once.
    if (trick && fx.trickRef === trick) {
      for (const player of trick.passed) {
        if (fx.passed.includes(player)) continue;
        const seatEl = player === HUMAN ? els.youArea : els.seats[player];
        if (!seatEl) continue;
        animate(seatEl, [
          { transform: "translateX(0)", opacity: 1 },
          { transform: "translateX(-4px)", opacity: 0.6, offset: 0.3 },
          { transform: "translateX(4px)", opacity: 0.85, offset: 0.6 },
          { transform: "translateX(0)", opacity: 1 },
        ], { duration: 340, easing: "ease-in-out" });
      }
    }

    // Trick cleared (or the round ended): collect the pile.
    if (
      fx.pileMinis.size > 0 &&
      trick &&
      fx.trickRef === trick &&
      (fx.trickNumber !== trick.trickNumber || state.phase !== "playing")
    ) {
      const winner =
        state.phase !== "playing" && trick.finishOrder.length > 0
          ? trick.finishOrder[0]
          : trick.lastPlayer;
      if (winner !== null && winner !== undefined) collectGhost(fx, winner);
    }

    // Bomb penalty: exactly two score boxes moved mid-round, by
    // opposite amounts — float the points and flash both boxes.
    // The score tracker is keyed to the match object: a New match
    // replaces it, and the reset render must not read the old
    // match's final scores as a fresh transfer (TASK 014 fix).
    if (
      state.phase === "playing" &&
      fx.scores &&
      state.match &&
      fxMatchRef === state.match
    ) {
      const now = state.match.scores;
      const changed = [0, 1, 2, 3].filter((p) => now[p] !== fx.scores![p]);
      if (changed.length === 2) {
        const [a, b] = changed as [number, number];
        const da = now[a] - fx.scores[a];
        const db = now[b] - fx.scores[b];
        if (da !== 0 && da === -db) {
          const payer = da < 0 ? a : b;
          const payee = da < 0 ? b : a;
          floatChop(payer, payee, Math.abs(da));
          for (const p of [payer, payee]) {
            const box = lastScoreBoxes[p];
            if (!box) continue;
            animate(box, [
              { filter: "brightness(1)" },
              { filter: "brightness(1.9) saturate(1.5)", offset: 0.35 },
              { filter: "brightness(1)" },
            ], { duration: 600, easing: "ease-out" });
          }
        }
      }
    }
  } finally {
    // Trackers always advance, motion or not.
    fxScores = state.match ? [...state.match.scores] : null;
    fxMatchRef = state.match;
    fxTrickRef = state.trick;
    fxTrickNumber = state.trick ? state.trick.trickNumber : 0;
    fxPassed = state.trick ? [...state.trick.passed] : [];
    justDraggedId = null;
  }
}

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
  node.dataset.cardId = card.id;
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
  // Lockout (TASK 014): a seat that passed this trick is greyed
  // with the LOCKED stamp until the trick clears or they come back
  // in (a comeback play removes them from `passed` in the engine).
  box.classList.toggle(
    "lockedout",
    state.phase === "playing" && trick !== null && trick.passed.includes(player),
  );
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
    if (bombBeats(bomb, trick.currentPlay.cards) && (!passed || isComebackBomb(bomb))) {
      bomb.forEach((card) => ids.add(card.id));
    }
  }
  return ids;
}

function renderBanner(state: ControllerState): void {
  const summary = state.roundSummary;
  const modal = els.banner.children[0] as HTMLElement | undefined;
  if ((state.phase !== "roundEnd" && state.phase !== "matchEnd") || !summary) {
    els.banner.hidden = true;
    modal?.classList.remove("instantwin");
    return;
  }
  els.banner.hidden = false;
  // Instant win (TASK 014): the modal carries the burst; the
  // winner's row pulses in. One-shot — the classes are re-applied
  // only while this banner renders.
  modal?.classList.toggle("instantwin", Boolean(summary.instantWin));
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
    if (summary.instantWin && row.player === summary.instantWin.winner) {
      tr.classList.add("winline");
    }
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
  summary.penalties.forEach((penalty, i) => {
    // Penalty rows (TASK 014): each slides in with a red flash,
    // staggered, instead of appearing as plain text.
    const p = el("p", "note penrow", penaltyLine(penalty));
    p.style.animationDelay = `${i * 130}ms`;
    // The ::before flash reads the same stagger from --d.
    if (typeof p.style.setProperty === "function") {
      p.style.setProperty("--d", `${i * 130}ms`);
    }
    body.append(p);
  });
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
      // The dropped card was pointer-glued to its slot: it gets no
      // settle FLIP in the render that follows (TASK 014).
      justDraggedId = btn.dataset.cardId ?? null;
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
    lastScoreBoxes[player] = box;
  }
}

export function render(state: ControllerState): void {
  const fx = beginFx();
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
      lastPileMinis = new Map();
      cp.cards.forEach((card) => {
        const mini = miniCard(card);
        lastPileMinis.set(card.id, mini);
        cards.append(mini);
      });
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
      lastPileMinis = new Map();
      els.toBeat.append(el("div", "empty", "New trick — anything goes"));
    }
  } else {
    els.trickInfo.textContent = state.phase === "idle" ? "Waiting to start" : "Round complete";
    els.toBeat.textContent = "";
    lastPileMinis = new Map();
    els.toBeat.append(
      el("div", "empty", state.phase === "idle" ? "Waiting to start" : "Round over"),
    );
  }
  els.message.textContent = state.message;

  // Your hand — rendered in the manual drag order when one exists for
  // this round, else in the current sort direction; comeback-bomb
  // cards carry the mockup's foil highlight.
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
  els.hand.textContent = "";
  lastHandBtns = new Map();
  for (const card of myHand) {
    const label = cardLabel(card);
    const btn = el(
      "button",
      `card ${label.color}${selected.has(card.id) ? " sel" : ""}${hot.has(card.id) ? " bombhot" : ""}${playableBombs.has(card.id) ? " bombplayable" : ""}`,
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
    lastHandBtns.set(card.id, btn);
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

  endFx(fx, state);
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

// How-to-play overlay (TASK 017): pure presentation. It never calls
// the controller and never renders, so a game in progress resumes
// exactly as it was when the overlay closes.
els.helpOverlay.hidden = true;
const setHelp = (open: boolean): void => {
  els.helpOverlay.hidden = !open;
};
els.helpTop.addEventListener("click", () => setHelp(true));
els.helpStart.addEventListener("click", () => setHelp(true));
els.helpClose.addEventListener("click", () => setHelp(false));
els.helpOverlay.addEventListener("click", (event) => {
  if (event.target === els.helpOverlay) setHelp(false);
});

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
