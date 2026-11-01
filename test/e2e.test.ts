import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seededRng } from "../src/engine/runner.js";

// Functional end-to-end tests for the playable UI.
//
// These load the REAL page module (src/main.js) — DOM adapter,
// controller, AI, and engine all live — and play it the way a person
// does: reading the screen and clicking buttons. Only the browser
// environment is faked: a minimal DOM (exactly the API surface
// main.js uses), a manual timer queue (CPU delays), and a seeded
// Math.random (deals), so matches are deterministic.
//
// The human seat is played by clicking Hint, then Play (or Pass when
// the hint says pass) — the same flow a player would use.

// ---------- fake DOM ----------

interface FakeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface FakeEvent {
  button?: number;
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  target?: unknown;
}

type FakeListener = (ev: FakeEvent) => void;

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  disabled = false;
  hidden = false;
  scrollTop = 0;
  scrollHeight = 0;
  title = "";
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, FakeListener[]> = {};
  _rect?: FakeRect;
  _text = "";
  _classes = new Set<string>();
  _className?: string;
  classList: {
    toggle: (name: string, force?: boolean) => void;
    add: (name: string) => void;
    remove: (name: string) => void;
  };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    this.classList = {
      toggle: (name, force) => {
        if (force === undefined) force = !this._classes.has(name);
        if (force) this._classes.add(name);
        else this._classes.delete(name);
        this._syncClass();
      },
      add: (name) => {
        this._classes.add(name);
        this._syncClass();
      },
      remove: (name) => {
        this._classes.delete(name);
        this._syncClass();
      },
    };
  }
  appendChild(node: FakeElement): FakeElement {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    this.children.push(node);
    return node;
  }
  insertBefore(node: FakeElement, ref: FakeElement | null): FakeElement {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }
  getBoundingClientRect(): FakeRect {
    return this._rect ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  _syncClass(): void {
    this._className = [...this._classes].join(" ");
  }
  set className(value: string) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
    this._syncClass();
  }
  get className(): string {
    return this._className ?? "";
  }
  set textContent(value: string) {
    this.children = [];
    this._text = value ?? "";
  }
  get textContent(): string {
    return this._text + this.children.map((child) => child.textContent).join("");
  }
  append(...nodes: (FakeElement | string)[]): void {
    for (let node of nodes) {
      if (typeof node === "string") node = new FakeText(node);
      this.children.push(node);
    }
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  addEventListener(type: string, fn: FakeListener): void {
    (this.listeners[type] ??= []).push(fn);
  }
  setPointerCapture(_pointerId: number): void {
    // No capture in the fake; drag handlers tolerate its absence.
  }
  click(): void {
    for (const fn of this.listeners.click ?? []) fn({ target: this });
  }
  // WAAPI stub (TASK 014): records every animation call so tests
  // can pin FLIP bookkeeping and the reduced-motion zero-call path.
  animations: { keyframes: unknown; options: unknown }[] = [];
  static totalAnimateCalls = 0;
  animate(
    keyframes: unknown,
    options?: unknown,
  ): { onfinish: (() => void) | null; finished: Promise<void>; cancel: () => void } {
    FakeElement.totalAnimateCalls += 1;
    this.animations.push({ keyframes, options });
    return { onfinish: null, finished: Promise.resolve(), cancel: () => {} };
  }
}

class FakeText extends FakeElement {
  constructor(text: string) {
    super("#text");
    this._text = text;
  }
  override get textContent(): string {
    return this._text;
  }
  override set textContent(value: string) {
    this._text = value;
  }
}

const ELEMENT_IDS = [
  "scores", "seat-1", "seat-2", "seat-3", "trick-info", "to-beat",
  "message", "you-area", "you-header", "hand", "play-btn", "pass-btn",
  "hint-btn", "log", "banner", "banner-title", "banner-body",
  "continue-btn", "new-match-btn", "start-screen", "start-btn",
  "round-num", "new-match-top", "sort-btn", "clear-btn",
  "help-btn-top", "help-btn-start", "help-overlay", "help-close",
];

const registry = new Map<string, FakeElement>();
const fakeDocument = {
  getElementById: (id: string): FakeElement => {
    if (!registry.has(id)) registry.set(id, new FakeElement("div"));
    return registry.get(id) as FakeElement;
  },
  createElement: (tag: string): FakeElement => new FakeElement(tag),
  createTextNode: (text: string): FakeText => new FakeText(text),
};
(globalThis as { document: unknown }).document = fakeDocument;

// ---------- fake timers + seeded deals ----------

const timerQueue: (() => void)[] = [];
const realSetTimeout = globalThis.setTimeout;
const installFakeTimers = (): void => {
  (globalThis as { setTimeout: unknown }).setTimeout = (fn: () => void) => {
    timerQueue.push(fn);
    return timerQueue.length;
  };
};
installFakeTimers();
Math.random = seededRng(2026);

const $ = (id: string): FakeElement => fakeDocument.getElementById(id);

function pumpTimers() {
  let guard = 0;
  while (timerQueue.length > 0) {
    if (++guard > 100000) throw new Error("timer queue did not drain");
    timerQueue.shift()!();
  }
}

// Advance until it is the human's move or a banner is showing.
function settle() {
  for (let i = 0; i < 10000; i++) {
    pumpTimers();
    if (!$("banner").hidden) return "banner";
    if (!$("play-btn").disabled) return "your-turn";
  }
  throw new Error("UI did not settle");
}

function handCount() {
  return $("hand").children.length;
}

function scoreValues() {
  // Scoreboard boxes (TASK 010 layout): the points live in the .pts
  // child of each box.
  return $("scores").children.map((box) => {
    const pts = box.children.find((child) =>
      (child.className ?? "").split(/\s+/).includes("pts"),
    );
    return pts ? Number(pts.textContent) : NaN;
  });
}

function handOrder() {
  // Rank+glyph of each rendered hand card, in display order.
  return $("hand").children.map(
    (btn) => btn.children[0].textContent + btn.children[1].textContent,
  );
}

function sortArrow(): FakeElement {
  return $("sort-btn").children.find((child) => child.className === "sort-arrow")!;
}

// Click through any round banners until it is the human's move.
function settleToYourTurn(): string | undefined {
  for (let i = 0; i < 1000; i++) {
    if (settle() === "your-turn") return;
    assert.ok(
      !/wins the match/.test($("banner-title").textContent),
      "unexpected match end while looking for a human turn",
    );
    $("continue-btn").click();
  }
  throw new Error("never reached a human turn");
}

// One human move, played through the real buttons.
function humanMove() {
  $("hint-btn").click();
  if ($("message").textContent.startsWith("Hint: pass")) {
    $("pass-btn").click();
  } else {
    $("play-btn").click();
  }
  const message = $("message").textContent;
  assert.ok(
    !/Select at least|not in your hand|does not beat|must include|not a valid/i.test(message),
    `hint-driven move was rejected: ${message}`,
  );
}

// ---------- the tests ----------

test("e2e: how-to-play overlay on the start screen — content, open/close, nothing starts (TASK 017)", async () => {
  // The shipped page carries the whole cheatsheet, initially hidden,
  // in John's vocabulary (bomb-penalty language, never "Chop").
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  for (const header of [
    "GOAL", "START", "YOUR TURN", "CARDS", "BOMBS BEAT 2s",
    "BOMB PENALTY", "INSTANT WINS (dealt hands)", "SCORING",
  ]) {
    assert.ok(html.includes(`<h3>${header}</h3>`), `missing cheatsheet section: ${header}`);
  }
  assert.ok(html.includes('id="help-overlay" hidden'), "help overlay must ship hidden");
  assert.ok(html.includes('id="help-btn-top"'), "header needs its How to play button");
  assert.ok(html.includes('id="help-btn-start"'), "start screen needs its How to play button");
  assert.ok(html.includes("Bomb a 2 and its owner pays you 1 point per 2 — instantly."));
  assert.ok(html.includes("Passing locks you out of the trick."));
  assert.ok(html.includes("2♥ is the biggest card in the game"));
  assert.ok(!html.toLowerCase().includes("chop"), "no chop vocabulary in the page");

  await import("../src/main.js"); // boots the page; must NOT start a match

  // Hidden at rest; the start screen's button opens it and the start
  // screen is still up behind it.
  assert.equal($("help-overlay").hidden, true);
  assert.equal($("start-screen").hidden, false);
  $("help-btn-start").click();
  assert.equal($("help-overlay").hidden, false);
  assert.equal($("start-screen").hidden, false);

  // Close button: back to the start screen, nothing dealt or started.
  $("help-close").click();
  assert.equal($("help-overlay").hidden, true);
  assert.equal($("start-screen").hidden, false);
  assert.equal(handCount(), 0);
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.equal($("log").children.length, 0);
  assert.equal(timerQueue.length, 0);

  // Backdrop click closes it too.
  $("help-btn-start").click();
  assert.equal($("help-overlay").hidden, false);
  $("help-overlay").click();
  assert.equal($("help-overlay").hidden, true);
  assert.equal($("start-screen").hidden, false);
});

test("e2e: start gate — nothing is dealt or running until Start Game is clicked", async () => {
  // The real page's Sort button contains an arrow span; mirror it in
  // the fake DOM before the page module grabs its elements.
  const arrow = fakeDocument.createElement("span");
  arrow.className = "sort-arrow";
  arrow.textContent = "↑";
  $("sort-btn").append(arrow);

  await import("../src/main.js"); // boots the page; must NOT start a match

  // Before the click: start screen up, no hand dealt, no match
  // running — controls dead, log empty, no banner, no timers pending.
  assert.equal($("start-screen").hidden, false);
  assert.equal(handCount(), 0);
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.equal($("play-btn").disabled, true);
  assert.equal($("pass-btn").disabled, true);
  assert.equal($("hint-btn").disabled, true);
  assert.equal($("log").children.length, 0);
  assert.equal($("banner").hidden, true);
  assert.equal(timerQueue.length, 0);

  // The click deals and begins the match; the gate drops for good.
  $("start-btn").click();
  assert.equal($("start-screen").hidden, true);
  assert.equal(handCount(), 13);
  assert.ok($("log").children.length > 0);
});

test("e2e: Sort toggles the rendered hand asc -> desc -> asc; Clear empties the selection", async () => {
  await import("../src/main.js"); // already booted and started by the gate test
  settle();
  const ascending = handOrder();
  assert.ok(ascending.length > 1, "need a dealt hand to sort");

  // Dealt ascending; arrow, title, and aria-label say so.
  assert.equal(sortArrow().textContent, "↑");
  assert.match($("sort-btn").title, /Sorted low to high \(ascending\)/);
  assert.match($("sort-btn").getAttribute("aria-label")!, /low to high ascending/);

  // First tap: descending — the rendered order is the exact reverse.
  $("sort-btn").click();
  assert.deepEqual(handOrder(), [...ascending].reverse());
  assert.equal(sortArrow().textContent, "↓");
  assert.match($("sort-btn").title, /Sorted high to low \(descending\)/);
  assert.match($("sort-btn").getAttribute("aria-label")!, /high to low descending/);

  // Second tap: back to ascending, strings restored.
  $("sort-btn").click();
  assert.deepEqual(handOrder(), ascending);
  assert.equal(sortArrow().textContent, "↑");
  assert.match($("sort-btn").title, /Sorted low to high \(ascending\)/);

  // Clear: select a card, clear, selection is gone and Play agrees.
  // (A click re-renders the hand, so re-read the card afterwards.)
  settleToYourTurn();
  $("hand").children[0].click();
  assert.ok(
    $("hand").children[0].className.includes("sel"),
    "card should show selected",
  );
  $("clear-btn").click();
  assert.ok(
    $("hand").children.every((btn) => !btn.className.includes("sel")),
    "no card should show selected after Clear",
  );
  $("play-btn").click();
  assert.match($("message").textContent, /Select at least one card/);
});

test("e2e: a full match plays end to end through the real UI", async () => {
  await import("../src/main.js"); // already booted by the gate test

  // Opening state: scores visible, hand dealt face up, log started.
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.ok($("log").children.length > 0);

  let sawRoundBanner = false;
  for (let steps = 0; steps < 20000; steps++) {
    const phase = settle();
    if (phase === "banner") {
      if (/wins the match/.test($("banner-title").textContent)) {
        // Match end: winner banner, a score at 13+, New Match offered.
        assert.ok(
          scoreValues().some((score) => score >= 13),
          `expected a score of 13+, got ${scoreValues()}`,
        );
        assert.equal($("new-match-btn").hidden, false);
        assert.equal($("continue-btn").hidden, true);
        assert.ok(sawRoundBanner, "match should pass through round banners");
        return;
      }
      sawRoundBanner = true;
      $("continue-btn").click();
      continue;
    }
    assert.equal(handCount() > 0, true, "human should hold cards on their turn");
    humanMove();
  }
  throw new Error("match did not finish within the step budget");
});

test("e2e: illegal clicks show a message and change nothing; New Match resets", async () => {
  // Start fresh from the previous test's match-end banner.
  assert.equal($("banner").hidden, false);
  $("new-match-btn").click();
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);

  // Play with nothing selected: message, hand untouched, still my turn.
  settleToYourTurn();
  const before = handCount();
  $("play-btn").click();
  assert.match($("message").textContent, /Select at least one card/);
  assert.equal(handCount(), before);
  assert.equal($("play-btn").disabled, false);

  // Select the whole hand and Play: the engine rejects it, the UI
  // shows the error, and nothing moves.
  for (const cardButton of [...$("hand").children]) cardButton.click();
  $("play-btn").click();
  assert.ok($("message").textContent.length > 0, "expected an error message");
  assert.equal(handCount(), before);
  assert.equal($("play-btn").disabled, false);

  (globalThis as { setTimeout: unknown }).setTimeout = realSetTimeout;
});

test("e2e: the pile shows a muted 'Before that' line for the play the current one beat", async () => {
  await import("../src/main.js"); // already booted; a match is in progress
  // The previous test restored real timers; reinstall the manual queue.
  installFakeTimers();
  let seen = null;
  for (let turn = 0; turn < 80 && !seen; turn++) {
    if (settleToYourTurn() === "matchEnd") {
      $("new-match-btn").click();
      continue;
    }
    const before = $("to-beat").children.find((child) =>
      child.textContent.startsWith("Before that:"),
    );
    if (before) seen = before;
    $("hint-btn").click();
    if ($("message").textContent.startsWith("Hint: pass")) $("pass-btn").click();
    else $("play-btn").click();
  }
  assert.ok(seen, "a 'Before that' line should appear once plays chain in a trick");
  assert.match(seen.textContent, /^Before that: (You|Mina|Kenji|Rosa) — /);
  assert.equal(seen.style.opacity, ".65");
});

// --- Drag-to-rearrange (TASK 010) -------------------------------------
// The fake DOM has no layout engine, so each hand card is given a
// stubbed rect: two wrapped rows of 54x76 cards. The pointer events
// are dispatched through the listeners main.js registered, exercising
// its real insertion math against those rects.
function fire(el: FakeElement, type: string, ev: FakeEvent = {}) {
  for (const fn of el.listeners[type] ?? []) fn({ button: 0, pointerId: 1, ...ev });
}

function layoutHand() {
  const kids = $("hand").children;
  const half = Math.ceil(kids.length / 2);
  kids.forEach((node, i) => {
    const row = i < half ? 0 : 1;
    const left = (i % half) * 62;
    const top = row * 84;
    node._rect = { left, top, right: left + 54, bottom: top + 76, width: 54, height: 76 };
  });
  return half;
}

const RANK_SEQ = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SUIT_SEQ = ["♠", "♣", "♦", "♥"];
function byValue(a: string, b: string): number {
  const rankDiff =
    RANK_SEQ.indexOf(a.slice(0, -1)) - RANK_SEQ.indexOf(b.slice(0, -1));
  if (rankDiff !== 0) return rankDiff;
  return SUIT_SEQ.indexOf(a[a.length - 1]) - SUIT_SEQ.indexOf(b[b.length - 1]);
}

function waitReal(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Spin: the post-drag click suppression is wall-clock based.
  }
}

test("e2e: drag reorders across rows and past the end; order persists; Sort overrides it", async () => {
  await import("../src/main.js"); // already booted; a match is in progress
  settleToYourTurn();
  assert.ok($("hand").children.length >= 6, "need at least 6 cards to drag");

  // Cross-row: drag a second-row card up into the first row, slot 2.
  const half = layoutHand();
  const before = handOrder();
  const dragIdx = half + 2;
  const dragEl = $("hand").children[dragIdx];
  fire(dragEl, "pointerdown", { clientX: 151, clientY: 122 });
  fire(dragEl, "pointermove", { clientX: 134, clientY: 40 });
  assert.ok(dragEl.className.includes("dragging"), "card should lift while dragging");
  assert.match(dragEl.style.transform, /^translate\(/);
  fire(dragEl, "pointerup", {});
  const expectedA = [...before];
  const [moved] = expectedA.splice(dragIdx, 1);
  expectedA.splice(2, 0, moved);
  assert.deepEqual(handOrder(), expectedA);

  // Past the end: drag the first card below/right of everything.
  layoutHand();
  const firstEl = $("hand").children[0];
  fire(firstEl, "pointerdown", { clientX: 27, clientY: 38 });
  fire(firstEl, "pointermove", { clientX: 600, clientY: 300 });
  fire(firstEl, "pointerup", {});
  const expectedB = [...expectedA.slice(1), expectedA[0]];
  assert.deepEqual(handOrder(), expectedB);

  // Persistence: a re-render (select + deselect) keeps the manual order.
  waitReal(300); // outlast the 250ms post-drag click suppression
  $("hand").children[0].click();
  assert.ok($("hand").children[0].className.includes("sel"));
  assert.deepEqual(handOrder(), expectedB);
  $("hand").children[0].click();
  assert.deepEqual(handOrder(), expectedB);

  // Sort after a manual order: first tap restores ascending (the
  // mockup's rule), second tap flips to descending.
  $("sort-btn").click();
  assert.deepEqual(handOrder(), [...expectedB].sort(byValue));
  assert.equal(sortArrow().textContent, "↑");
  $("sort-btn").click();
  assert.deepEqual(handOrder(), [...expectedB].sort(byValue).reverse());
  assert.equal(sortArrow().textContent, "↓");
  $("sort-btn").click(); // leave the hand ascending for later tests
  assert.equal(sortArrow().textContent, "↑");

  // A plain tap (pointer down/up, no move) still selects via click.
  const tapEl = $("hand").children[1];
  fire(tapEl, "pointerdown", { clientX: 89, clientY: 38 });
  fire(tapEl, "pointerup", {});
  tapEl.click();
  assert.ok($("hand").children[1].className.includes("sel"), "tap should select");
  $("hand").children[1].click(); // deselect again
});

test("e2e: select then deselect — the second tap clears .sel and Play reports no selection", async () => {
  await import("../src/main.js"); // already booted; a match is in progress
  settleToYourTurn();
  // (Each click re-renders the hand, so re-read the card afterwards.)
  $("hand").children[0].click();
  assert.ok(
    $("hand").children[0].className.includes("sel"),
    "first tap should select the card",
  );
  $("hand").children[0].click();
  assert.ok(
    $("hand").children.every((btn) => !btn.className.includes("sel")),
    "second tap must leave no card selected",
  );
  $("play-btn").click();
  assert.match($("message").textContent, /Select at least one card/);
});

test("css: the pile is one fixed size per breakpoint and the minicards row never wraps (TASK 015)", () => {
  // The fake DOM has no layout engine, so the fixed-size guarantee is
  // asserted at the CSS level: the exact height declarations the
  // worst-case math in styles.css is built on. Tests run compiled
  // (npm test -> .test-out/), so the stylesheet is two levels up.
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const blockOf = (text: string, selector: string): string => {
    const at = text.indexOf(selector);
    assert.ok(at >= 0, `${selector} not found in styles.css`);
    return text.slice(at, text.indexOf("}", at));
  };
  // Base breakpoint: a true fixed height (not a min-height that can
  // still grow), sized for lead 2 lines + minis + before 2 lines.
  const base = blockOf(css, ".pile{");
  assert.ok(base.includes("height:179px"), `base .pile should fix height:179px, got: ${base}`);
  assert.ok(!base.includes("min-height"), "base .pile must not keep a resizable min-height");
  // Phone breakpoint: the fixed height covers 3 + 3 wrapped lines.
  const media = css.slice(css.indexOf("@media (max-width:640px)"));
  assert.ok(media.length > 0, "phone media query not found");
  assert.ok(
    blockOf(media, ".pile{").includes("height:207px"),
    "phone .pile should fix height:207px",
  );
  // The card row is one row by construction: no wrapping, fanned minis.
  assert.ok(
    blockOf(css, ".minicards{").includes("flex-wrap:nowrap"),
    ".minicards must not wrap",
  );
});

test("e2e: how-to-play overlay mid-game — header button, close leaves the game untouched (TASK 017)", async () => {
  await import("../src/main.js"); // already booted by the earlier tests

  // Fresh match from the header, then play to the human's turn
  // (clicking through any round banner on the way).
  $("new-match-top").click();
  for (let i = 0; i < 50 && settle() === "banner"; i++) {
    if (!$("new-match-btn").hidden) $("new-match-btn").click();
    else $("continue-btn").click();
  }
  const before = {
    hand: handCount(),
    scores: scoreValues(),
    turn: $("trick-info").textContent,
    log: $("log").children.length,
  };
  assert.ok(before.hand > 0, "need a live game for the mid-game check");

  $("help-btn-top").click();
  assert.equal($("help-overlay").hidden, false);
  $("help-close").click();
  assert.equal($("help-overlay").hidden, true);

  // Hands, scores, current turn and the log are exactly as they were.
  assert.equal(handCount(), before.hand);
  assert.deepEqual(scoreValues(), before.scores);
  assert.equal($("trick-info").textContent, before.turn);
  assert.equal($("log").children.length, before.log);
  assert.equal($("play-btn").disabled, false); // still the human's turn
});

// ---------- TASK 014: animation layer ----------

function pileMinis(): FakeElement[] {
  const wrap = $("to-beat").children.find((child) =>
    (child.className ?? "").split(/\s+/).includes("minicards"),
  );
  return wrap ? wrap.children : [];
}

test("e2e: a played card FLIPs into the pile (TASK 014)", async () => {
  await import("../src/main.js"); // already booted by the earlier tests
  $("new-match-top").click();
  // Reach a turn where you lead (pile empty). Your hinted lead play
  // is then the latest render — CPU timers have not run yet — so the
  // pile's minis are exactly the cards you just played.
  let led = false;
  for (let steps = 0; steps < 2000 && !led; steps++) {
    settleToYourTurn();
    if (pileMinis().length === 0) led = true;
    else humanMove();
  }
  assert.ok(led, "never reached a lead turn");
  humanMove(); // the lead play
  const minis = pileMinis();
  assert.ok(minis.length > 0, "the lead play should be in the pile");
  assert.ok(
    minis.every((mini) => mini.animations.length > 0),
    `every played card should carry a FLIP animation, got counts ${minis.map((m) => m.animations.length)}`,
  );
});

test("e2e: lockout grey — a CPU lockout pass greys the seat until the round ends (TASK 014)", async () => {
  await import("../src/main.js");
  $("new-match-top").click();
  const seatIds: Record<string, string> = { Mina: "seat-1", Kenji: "seat-2", Rosa: "seat-3" };
  let greySeat: string | null = null;
  for (let steps = 0; steps < 20000 && greySeat === null; steps++) {
    const phase = settle();
    if (phase === "banner") {
      assert.ok(
        !/wins the match/.test($("banner-title").textContent),
        "match ended before any CPU lockout pass",
      );
      $("continue-btn").click();
      continue;
    }
    const lines = $("log").children.map((li) => li.textContent);
    const m = /^(Mina|Kenji|Rosa) passes — locked out\.$/.exec(lines[lines.length - 1] ?? "");
    if (m) {
      greySeat = seatIds[m[1] as string];
      assert.ok(
        $(greySeat).className.includes("lockedout"),
        `${m[1]} should be greyed while locked out; seat class is "${$(greySeat).className}"`,
      );
    } else {
      humanMove();
    }
  }
  assert.ok(greySeat !== null, "expected at least one CPU lockout pass in a match");
  // The grey lifts when the trick is over: play to the round banner
  // and confirm no seat remains locked out.
  let bannered = false;
  for (let steps = 0; steps < 20000 && !bannered; steps++) {
    if (settle() === "banner") bannered = true;
    else humanMove();
  }
  assert.ok(bannered, "the round should end");
  for (const id of ["seat-1", "seat-2", "seat-3"]) {
    assert.ok(
      !$(id).className.includes("lockedout"),
      `${id} should not stay greyed after the round`,
    );
  }
});

test("e2e: animations on vs reduced-motion — identical final state, zero calls when reduced (TASK 014)", async () => {
  await import("../src/main.js");
  const playOutMatch = (): { scores: number[]; title: string } => {
    $("new-match-top").click();
    for (let steps = 0; steps < 20000; steps++) {
      const phase = settle();
      if (phase === "banner") {
        if (/wins the match/.test($("banner-title").textContent)) {
          return { scores: scoreValues(), title: $("banner-title").textContent };
        }
        $("continue-btn").click();
        continue;
      }
      humanMove();
    }
    throw new Error("match did not finish within the step budget");
  };

  // Reduced motion (a fake matchMedia that says "reduce"): the
  // whole match must issue zero animation calls.
  (globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: true }),
  };
  Math.random = seededRng(7);
  const callsBeforeReduced = FakeElement.totalAnimateCalls;
  const reduced = playOutMatch();
  assert.equal(
    FakeElement.totalAnimateCalls - callsBeforeReduced,
    0,
    "reduced motion must issue zero animation calls",
  );
  delete (globalThis as { window?: unknown }).window;

  // Motion on, same seed, same scripted play: the animation layer
  // fires — and the match lands in exactly the same final state.
  Math.random = seededRng(7);
  const callsBeforeOn = FakeElement.totalAnimateCalls;
  const animated = playOutMatch();
  assert.ok(
    FakeElement.totalAnimateCalls - callsBeforeOn > 0,
    "expected animation calls with motion on",
  );
  assert.deepEqual(animated, reduced);
});
