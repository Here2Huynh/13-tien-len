import type { ControllerState } from "../ui/controller.js";
import type { Match } from "../engine/match.js";
import type { Card } from "../engine/cards.js";
import { functionedAsBomb } from "../engine/bombs.js";
import { HUMAN } from "../ui/model.js";
import { els, el } from "./elements.js";
import type { PilePlays } from "./pile.js";

// ---- Animation layer (TASK 014) ------------------------------------
// Pure presentation over the render cycle: beginFx snapshots the
// pre-render layout (from the element refs the last render left
// behind) plus the adapter's scalar trackers; endFx compares and
// fires WAAPI motion. Transform/opacity only, fire-and-forget —
// animations never gate input or timers, in-flight ones are
// cancelled at the next render, and the final DOM is identical with
// motion on or off. prefers-reduced-motion disables everything.
//
// Round/trick identity (TASK 036): "same round" and "new trick" are
// read from the controller's explicit roundId / trickId, never from
// the identity of the trick state object.

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FxBegin {
  handRects: Map<string, RectLike>;
  handPos: Map<string, { x: number; y: number }>;
  pileRects: Map<string, RectLike>;
  pileMinis: Map<string, HTMLElement>;
  scores: number[] | null;
  roundId: number;
  trickId: number;
  passed: number[];
  playKey: string | null;
}

// The element refs the last render left behind. The renderers own
// their contents (hand.ts writes handBtns — also its button-reuse
// cache — pile.ts pileMinis, board.ts scoreBoxes); the fx layer
// reads them before (beginFx) and after (endFx) each render.
export const refs = {
  handBtns: new Map<string, HTMLElement>(),
  pileMinis: new Map<string, HTMLElement>(),
  scoreBoxes: [] as (HTMLElement | undefined)[],
};

let fxScores: number[] | null = null;
let fxMatchRef: Match | null = null;
let fxRoundId = 0;
let fxTrickId = 0;
let fxPassed: number[] = [];
let justDraggedId: string | null = null;
const liveAnims = new Set<Animation>();

// The dropped card was pointer-glued to its slot: it gets no
// settle FLIP in the render that follows (TASK 014).
export function markJustDragged(id: string | null): void {
  justDraggedId = id;
}

// Stamp once per lockout (TASK 028): was this seat already locked
// out in the previous render of this same round? Read during a
// render, before endFx advances the trackers.
export function lockedInLastRender(roundId: number, player: number): boolean {
  return fxRoundId === roundId && fxPassed.includes(player);
}

export function motionAllowed(): boolean {
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

// TASK 024: the stage (.wrap) zooms with the viewport (see
// styles.css): factor = viewport width over the 1080px design
// width, floored at 1, capped at 1.5. Rects are VISUAL pixels
// (post-zoom) while a CSS transform on an in-stage element is in
// LOCAL (pre-zoom) pixels, so a rect-derived delta becomes a
// local translate only after dividing by this factor. Mirrors
// the CSS exactly; the test harness has no viewport, so it
// reads 1 there and the math is today's.
//
// TASK 045: the factor is also bound by viewport height over
// the stage's 1280px design height (see styles.css), and at
// phone widths the CSS block pins the zoom to 1 — both mirrored
// here. A missing height (the harness's stub window) leaves the
// width bound alone, as before.
const STAGE_DESIGN_HEIGHT = 1280;

export function stageScale(): number {
  const w = typeof window !== "undefined" ? window.innerWidth : 0;
  if (!w || !Number.isFinite(w)) return 1;
  if (w <= 520) return 1;
  const widthBound = Math.min(1.5, Math.max(1, w / 1080));
  const h = typeof window !== "undefined" ? window.innerHeight : 0;
  if (!h || !Number.isFinite(h)) return widthBound;
  return Math.min(widthBound, h / STAGE_DESIGN_HEIGHT);
}

export function beginFx(playKey: string | null): FxBegin {
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
  const handPos = new Map<string, { x: number; y: number }>();
  for (const [id, btn] of refs.handBtns) {
    handRects.set(id, rectOf(btn));
    // Layout position (TASK 023): offsetLeft/offsetTop ignore
    // transforms, so a hover/selected pose change never reads as
    // movement. Painted boxes above stay for the pile fly-out.
    handPos.set(id, { x: btn.offsetLeft, y: btn.offsetTop });
  }
  const pileRects = new Map<string, RectLike>();
  for (const [id, mini] of refs.pileMinis) pileRects.set(id, rectOf(mini));
  return {
    handRects,
    handPos,
    pileRects,
    pileMinis: refs.pileMinis,
    scores: fxScores,
    roundId: fxRoundId,
    trickId: fxTrickId,
    passed: fxPassed,
    playKey,
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
  const fromBox = refs.scoreBoxes[payer];
  const toBox = refs.scoreBoxes[payee];
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

// Shockwave (TASK 050 — design A, the owner's pick from the
// 2026-11-04 mockups): when a bomb play lands, two gold rings
// expand outward from the played cards across the felt, the felt
// brightens in a radial gold pulse centered on the played cards,
// and the played cards settle with a small overshoot bounce —
// the independent `scale` property, so the bounce stacks on the
// landing FLIP instead of fighting it. Spawned nodes live in the
// fx layer and remove themselves; the final DOM is unchanged.
// Fires only from endFx's play-landed branch, under the same
// condition as the pile pulse it layers with — the standing play
// changed AND the play functioned as a bomb — so passes,
// non-bomb plays, re-renders of the standing play, and instant
// wins (no play ever lands) never trigger it, and a bomb-vs-bomb
// chain re-fires per bomb. Anchored on the played minis' landing
// boxes as measured by the FLIP loop in endFx BEFORE it applies
// the FLIP transform — a rectOf read after that would return the
// mid-FLIP painted box (the cards halfway home), which is the
// trap the mockup's layout-geometry rule exists to avoid.
function shockwaveBomb(cards: Card[], landedRects: Map<string, RectLike>): void {
  if (!motionAllowed()) return;
  const layer = getFxLayer();
  if (!layer) return;
  const minis = cards
    .map((c) => refs.pileMinis.get(c.id))
    .filter((m): m is HTMLElement => m !== undefined);
  if (minis.length === 0) return;
  // A mini the FLIP loop skipped (no source rect) carries no FLIP
  // transform, so its live rect already is its landing box.
  const rects = cards
    .map((c) => landedRects.get(c.id) ?? (() => {
      const m = refs.pileMinis.get(c.id);
      return m ? rectOf(m) : undefined;
    })())
    .filter((r): r is RectLike => r !== undefined);
  if (rects.length === 0) return;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  const fire = (
    node: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    cleanupMs: number,
  ): void => {
    try {
      const anim = node.animate(keyframes, options);
      anim.onfinish = () => node.remove();
    } catch {
      node.remove();
      return;
    }
    setTimeout(() => node.remove(), cleanupMs); // belt-and-braces cleanup
  };

  // Two gold rings expand from the played cards.
  const size = Math.max(40, bottom - top);
  [0, 140].forEach((delay, i) => {
    const ring = el("div", i === 0 ? "fx-shockring" : "fx-shockring two");
    ring.style.left = `${cx - size / 2}px`;
    ring.style.top = `${cy - size / 2}px`;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    layer.append(ring);
    fire(
      ring,
      [
        { transform: "scale(.4)", opacity: 0 },
        { transform: "scale(1)", opacity: 1, offset: 0.12 },
        { transform: "scale(6.2)", opacity: 0 },
      ],
      { duration: 900, delay, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" },
      1600,
    );
  });

  // The felt brightens in a radial gold pulse centered on the
  // played cards, spanning the table — measured as the union of
  // the table's own landmarks (the three seats, your area, the
  // pile), the elements the fx layer already tracks.
  const felt = el("div", "fx-shockfelt");
  const landmarks = [els.seats[1], els.seats[2], els.seats[3], els.youArea, els.toBeat]
    .filter((n): n is HTMLElement => Boolean(n))
    .map((n) => rectOf(n));
  const fLeft = Math.min(...landmarks.map((r) => r.left));
  const fTop = Math.min(...landmarks.map((r) => r.top));
  const fRight = Math.max(...landmarks.map((r) => r.left + r.width));
  const fBottom = Math.max(...landmarks.map((r) => r.top + r.height));
  const fw = fRight - fLeft > 0 ? fRight - fLeft : (right - left) * 4;
  const fh = fBottom - fTop > 0 ? fBottom - fTop : (bottom - top) * 6;
  const fx0 = fRight - fLeft > 0 ? fLeft : cx - fw / 2;
  const fy0 = fBottom - fTop > 0 ? fTop : cy - fh / 2;
  felt.style.left = `${fx0}px`;
  felt.style.top = `${fy0}px`;
  felt.style.width = `${fw}px`;
  felt.style.height = `${fh}px`;
  const gx = fw > 0 ? (((cx - fx0) / fw) * 100).toFixed(2) : "50";
  const gy = fh > 0 ? (((cy - fy0) / fh) * 100).toFixed(2) : "38";
  felt.style.background =
    `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,222,120,.5) 0%, rgba(255,178,35,.22) 34%, rgba(255,178,35,0) 68%)`;
  layer.append(felt);
  fire(
    felt,
    [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }],
    { duration: 750, easing: "ease-out" },
    1200,
  );

  // The played cards settle with a small overshoot bounce.
  for (const mini of minis) {
    animate(mini, [
      { scale: "1.16" },
      { scale: "0.95", offset: 0.55 },
      { scale: "1.03", offset: 0.8 },
      { scale: "1" },
    ], { duration: 520, delay: 290, easing: "ease-out" });
  }
}

const DEAL_FRAMES: Keyframe[] = [
  { transform: "translateY(-18px) scale(.94)", opacity: 0 },
  { transform: "translateY(0) scale(1)", opacity: 1 },
];

export function endFx(fx: FxBegin, state: ControllerState, pile: PilePlays): void {
  const trick = state.trick;
  // Same round as the previous render (TASK 036: explicit roundId,
  // formerly "the same trick state object").
  const sameRound = fx.roundId === state.roundId;
  try {
    if (!motionAllowed()) return;

    // Deal: a new roundId is a new round. Seats settle in turn
    // order from the leader — CPU stacks as units, the human hand
    // card by card — all inside ~1s.
    if (trick && !sameRound && state.phase === "playing") {
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
    if (trick?.currentPlay && fx.playKey !== pile.playKey) {
      const cp = trick.currentPlay;
      const seatRect = rectOf(els.seats[cp.player] ?? els.youArea);
      const landedRects = new Map<string, RectLike>();
      for (const [id, mini] of refs.pileMinis) {
        const src =
          fx.handRects.get(id) ?? (cp.player !== HUMAN ? seatRect : undefined);
        if (!src) continue;
        const dst = rectOf(mini);
        landedRects.set(id, dst);
        animate(mini, [
          {
            transform: `translate(${(src.left - dst.left) / stageScale()}px, ${(src.top - dst.top) / stageScale()}px) scale(1.05)`,
            opacity: 0.85,
          },
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
        ], { duration: 320, easing: "cubic-bezier(.25,.9,.3,1.18)" });
      }
      const wasBomb = functionedAsBomb(pile.prevPlay, cp.cards);
      if (wasBomb) {
        animate(els.toBeat, [
          { transform: "scale(1)" },
          { transform: "scale(1.055)", offset: 0.4 },
          { transform: "scale(1)" },
        ], { duration: 380, easing: "ease-out" });
        shockwaveBomb(cp.cards, landedRects);
      }
    }

    // Hand settle: cards whose LAYOUT slot moved (sort, drag
    // settle, reflow after a play) glide to their new positions.
    // The comparison is layout positions, never painted boxes
    // (TASK 023): a pose change (select / deselect / Hint / Clear)
    // moves no slot, so it can never trigger this — with painted
    // boxes it did, and the animation replaced the card's pose for
    // 260ms, reading as a drop below rest before the snap back.
    // Real moves animate the CSS `translate` property, which
    // stacks on top of the pose transform, so a selected card
    // keeps its lift while it slides. The just-dragged card is
    // excluded — it was pointer-glued. Same-round only: hand
    // positions are per-round layout state, and on a round change
    // the deal stagger owns all card motion.
    if (sameRound) {
      for (const [id, btn] of refs.handBtns) {
        if (id === justDraggedId) continue;
        const pre = fx.handPos.get(id);
        if (!pre) continue;
        const dx = pre.x - btn.offsetLeft;
        const dy = pre.y - btn.offsetTop;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        animate(btn, [
          { translate: `${dx}px ${dy}px` },
          { translate: "0px 0px" },
        ], { duration: 260, easing: "cubic-bezier(.25,.9,.3,1.15)" });
      }
    }

    // Pass flash: seats that newly locked out shake/flash once.
    if (trick && sameRound) {
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

    // Trick cleared (a new trickId within the same round) or the
    // round ended: collect the pile. The round-end winner is the
    // round's first finisher; a mid-round clear collects to the
    // trick winner the controller captured as the trick cleared
    // (TASK 049 — the engine nulls trick.lastPlayer in the act of
    // clearing, so reading it here found nobody and the mid-round
    // collect never fired).
    if (
      fx.pileMinis.size > 0 &&
      trick &&
      sameRound &&
      (fx.trickId !== state.trickId || state.phase !== "playing")
    ) {
      const winner =
        state.phase !== "playing" && trick.finishOrder.length > 0
          ? trick.finishOrder[0]
          : state.lastTrickWinner;
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
            const box = refs.scoreBoxes[p];
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
    fxRoundId = state.roundId;
    fxTrickId = state.trickId;
    fxPassed = state.trick ? [...state.trick.passed] : [];
    justDraggedId = null;
  }
}
