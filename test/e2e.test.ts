import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createDeck, makeCard, type Card } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { createMatch } from "../src/engine/match.js";
import { emptyTrickView } from "../src/ui/model.js";
import type { ControllerState } from "../src/ui/controller.js";
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
  // Parent tracking (TASK 023): the fake now knows the tree, so
  // remove() really detaches and layout offsets can be simulated.
  parent: FakeElement | null = null;
  // Spawn history, recorded ONLY on the fx layer: its floats and
  // ghosts remove themselves, so tests count spawns here instead
  // of live children. (Recording this on every element would
  // retain each render's throwaway nodes for the whole suite.)
  appendHistory: FakeElement[] = [];
  appendChild(node: FakeElement): FakeElement {
    if (node.parent) {
      const i = node.parent.children.indexOf(node);
      if (i >= 0) node.parent.children.splice(i, 1);
    }
    node.parent = this;
    this.children.push(node);
    if (this.className === "fx-layer") this.appendHistory.push(node);
    return node;
  }
  insertBefore(node: FakeElement, ref: FakeElement | null): FakeElement {
    if (node.parent) {
      const i = node.parent.children.indexOf(node);
      if (i >= 0) node.parent.children.splice(i, 1);
    }
    node.parent = this;
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    if (this.className === "fx-layer") this.appendHistory.push(node);
    return node;
  }
  // Simulated layout (TASK 023): a child's layout slot is its index
  // among its siblings (70px columns), so reordering children —
  // Sort, drag — moves it, while pose transforms never do. This is
  // what lets a unit test give the hand non-zero layout boxes.
  get offsetLeft(): number {
    return this.parent ? this.parent.children.indexOf(this) * 70 : 0;
  }
  get offsetTop(): number {
    return 0;
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
    for (const child of this.children) child.parent = null;
    this.children = [];
    this._text = value ?? "";
  }
  get textContent(): string {
    return this._text + this.children.map((child) => child.textContent).join("");
  }
  append(...nodes: (FakeElement | string)[]): void {
    for (let node of nodes) {
      if (typeof node === "string") node = new FakeText(node);
      this.appendChild(node);
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
  remove(): void {
    // Real detach via parent tracking (TASK 023). Fx floats stay
    // countable through the layer's appendHistory.
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
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
  "odds-btn-top", "odds-btn-start", "odds-overlay", "odds-close",
];

const registry = new Map<string, FakeElement>();
const fakeDocument = {
  getElementById: (id: string): FakeElement => {
    if (!registry.has(id)) registry.set(id, new FakeElement("div"));
    return registry.get(id) as FakeElement;
  },
  createElement: (tag: string): FakeElement => new FakeElement(tag),
  createTextNode: (text: string): FakeText => new FakeText(text),
  // A body so the adapter's fx layer (bomb-penalty floats) has
  // somewhere to live and tests can count what it spawns.
  body: new FakeElement("body"),
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

// A match can end on a normal round ("… wins the match!") or on
// an instant-win round ("Match over!") — both are match ends.
function isMatchEndBanner(): boolean {
  const title = $("banner-title").textContent;
  return /wins the match/.test(title) || title === "Match over!";
}

// Click through any round banners until it is the human's move.
function settleToYourTurn(): string | undefined {
  for (let i = 0; i < 1000; i++) {
    if (settle() === "your-turn") return;
    assert.ok(
      !isMatchEndBanner(),
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

test("e2e: favicon links ship in the document head (TASK 020)", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, "document must have a head");
  for (const link of [
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  ]) {
    assert.ok(head.includes(link), `missing icon link: ${link}`);
  }
});

test("e2e: build ships all three unchanged icon assets (TASK 020)", () => {
  const root = new URL("../../", import.meta.url);
  execFileSync(process.execPath, ["build.mjs"], { cwd: root, stdio: "inherit" });
  for (const icon of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
    const source = readFileSync(new URL(icon, root));
    assert.ok(source.length > 0, `${icon} must not be empty`);
    assert.deepEqual(readFileSync(new URL(`dist/${icon}`, root)), source);
  }
});

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
  for (const example of [
    "Example: 4♠4♣ 5♠5♣ 6♠6♣ — a 3-pair double run — bombs a single 2.",
    "Example: 4♠4♣ 5♠5♣ 6♠6♣ 7♠7♣ — a 4-pair double run — bombs a pair of 2s.",
    "Example: 9♠9♣9♦9♥ — four of a kind — bombs a single 2 or a pair of 2s.",
  ]) assert.ok(html.includes(`<p>${example}</p>`), `missing bomb example: ${example}`);
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

// ---------- TASK 022: Bomb odds card ----------

// Everything the adapter has painted: every element it has touched,
// recursively — classes, text, hidden/disabled, attributes, dataset,
// inline style — plus the pending CPU timer count.
interface DomSnapshot {
  tag: string;
  className: string;
  text: string;
  hidden: boolean;
  disabled: boolean;
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: DomSnapshot[];
}
function snapshotNode(node: FakeElement): DomSnapshot {
  return {
    tag: node.tagName, className: node.className, text: node._text,
    hidden: node.hidden, disabled: node.disabled,
    attrs: { ...node.attrs }, dataset: { ...node.dataset }, style: { ...node.style },
    children: node.children.map(snapshotNode),
  };
}
function pageSnapshot(): { dom: Record<string, DomSnapshot>; body: DomSnapshot; timers: number } {
  const dom: Record<string, DomSnapshot> = {};
  for (const id of [...registry.keys()].sort()) dom[id] = snapshotNode(registry.get(id)!);
  return { dom, body: snapshotNode(fakeDocument.body), timers: timerQueue.length };
}

test("e2e: bomb odds card on the start screen — ships hidden, both buttons, open/close, nothing starts (TASK 022)", async () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="odds-overlay" hidden'), "odds card must ship hidden");
  // Its own button, right next to How to play, in both places.
  assert.ok(html.includes(
    '<button class="ghost small" id="help-btn-top" type="button">How to play</button>\n' +
    '          <button class="ghost small" id="odds-btn-top" type="button">Bomb odds</button>',
  ), "header: Bomb odds sits next to How to play");
  assert.ok(html.includes(
    '<button id="help-btn-start" class="ghost" type="button">How to play</button>\n' +
    '          <button id="odds-btn-start" class="ghost" type="button">Bomb odds</button>',
  ), "start screen: Bomb odds sits next to How to play");
  // A standalone card, not a section of How to play.
  const help = html.match(/id="help-overlay"[\s\S]*?id="help-close"/)?.[0] ?? "";
  assert.ok(help.length > 0 && !help.includes("odds"), "odds stay out of the How to play overlay");
  assert.ok(!html.toLowerCase().includes("chop"), "no chop vocabulary in the page");
  // No new motion: the card's rules carry no animation or transition.
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const cardRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /oddscard|odds-/.test(m[1]));
  assert.ok(cardRules.length > 0, "the card is styled");
  for (const rule of cardRules) {
    assert.ok(!/animation|transition/.test(rule[2]), `no motion on ${rule[1].trim()}`);
  }

  await import("../src/main.js"); // already booted, or boots idle

  assert.equal($("odds-overlay").hidden, true);
  assert.equal($("start-screen").hidden, false);
  const before = pageSnapshot();
  $("odds-btn-start").click();
  assert.equal($("odds-overlay").hidden, false);
  assert.equal($("start-screen").hidden, false);
  $("odds-close").click();
  assert.equal($("odds-overlay").hidden, true);
  assert.deepEqual(pageSnapshot(), before, "open/close leaves the page untouched");
  assert.equal($("start-screen").hidden, false);
  assert.equal(handCount(), 0);
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.equal($("log").children.length, 0);
  assert.equal(timerQueue.length, 0);

  // Backdrop click closes it too.
  $("odds-btn-start").click();
  assert.equal($("odds-overlay").hidden, false);
  $("odds-overlay").click();
  assert.equal($("odds-overlay").hidden, true);
  assert.deepEqual(pageSnapshot(), before);
});

test("e2e: how-to-play teaches bomb on a bomb with the worked example (TASK 021)", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(html.includes(
    "<p>Bombs can be bombed. A higher bomb of the same kind answers it, and a 4-pair double run bombs any bomb. Four of a kind can't bomb a pair-run bomb.</p>",
  ));
  assert.ok(html.includes(
    "<p>Example: 2♥ is bombed by 4♠4♣ 5♠5♣ 6♠6♣ — a 3-pair double run — then 7♠7♣ 8♠8♣ 9♠9♣ — a higher 3-pair double run — bombs that bomb. The 2's owner pays the first bomber 1 point, and the first bomber pays the second 1 point.</p>",
  ));
  assert.ok(html.includes(
    "<p>Bomb a bomb and its owner pays you 1 point — instantly. Even a led four of a kind counts: beat it with a higher four of a kind or a 4-pair double run and its owner pays you 1.</p>",
  ));
  assert.ok(!html.toLowerCase().includes("chop"), "no chop vocabulary in the page");
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

test("e2e: bomb odds card mid-game with CPU timers pending — open/close leaves the game byte-identical (TASK 022)", async () => {
  await import("../src/main.js"); // already booted by the earlier tests

  $("new-match-top").click();
  // Play human moves until CPU turns are queued behind the timer.
  let pending = false;
  for (let steps = 0; steps < 200 && !pending; steps++) {
    settleToYourTurn();
    humanMove();
    pending = timerQueue.length > 0 && $("banner").hidden;
  }
  assert.ok(pending, "need CPU timers pending for the mid-game probe");
  assert.ok(handCount() > 0, "need a live game");

  const before = pageSnapshot();
  $("odds-btn-top").click();
  assert.equal($("odds-overlay").hidden, false);
  const open = pageSnapshot();
  open.dom["odds-overlay"].hidden = true; // the one thing opening changes
  assert.deepEqual(open, before, "opening touches nothing but the card");
  $("odds-close").click();
  assert.equal($("odds-overlay").hidden, true);
  assert.deepEqual(pageSnapshot(), before, "closing restores the page exactly");

  // The queued CPU turns then run as normal.
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner");
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
        !isMatchEndBanner(),
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
        if (isMatchEndBanner()) {
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

test("e2e: bomb-penalty float — none on a New match reset, exactly one per genuine chop (TASK 014 fix)", async () => {
  await import("../src/main.js");
  const floatCount = (): number => {
    const layer = fakeDocument.body.children.find((ch) => ch.className === "fx-layer");
    // appendHistory, not children: a float's own cleanup removes it
    // from the layer, but the spawn is what the assertions count.
    return layer ? layer.appendHistory.filter((ch) => ch.className === "fx-float").length : 0;
  };
  // A chop is the only mid-round score change, and it always moves
  // exactly two boxes by opposite amounts — the same signature the
  // adapter keys on.
  const isChopDelta = (before: number[], after: number[]): boolean => {
    const changed = [0, 1, 2, 3].filter((p) => before[p] !== after[p]);
    return (
      changed.length === 2 &&
      after[changed[0]] - before[changed[0]] ===
        -(after[changed[1]] - before[changed[1]])
    );
  };

  // The verifier's repro, made deterministic: drive a match to the
  // armed state (round 1, mid-round, scores are exactly two
  // non-zero boxes with opposite values — a shape only a bomb
  // penalty can produce at that point, [0, 1, 0, -1] and
  // rotations), then click New match ONCE and assert on that
  // render. If the reset happens to deal an instant win, its
  // render is at roundEnd — where the signature is phase-gated
  // even in the buggy code — AND it launders the score tracker to
  // a four-box shape, so the attempt proves nothing: re-arm and
  // retry instead of clicking through.
  let resetChecked = false;
  for (let attempt = 0; attempt < 8 && !resetChecked; attempt++) {
    $("new-match-top").click();
    let armed = false;
    for (let steps = 0; steps < 20000 && !armed; steps++) {
      const phase = settle();
      if (phase === "banner") {
        if (isMatchEndBanner()) $("new-match-btn").click();
        else $("continue-btn").click();
        continue;
      }
      const nz = scoreValues().filter((s) => s !== 0);
      if ($("round-num").textContent === "1" && nz.length === 2 && nz[0] + nz[1] === 0) {
        armed = true;
      } else {
        humanMove();
      }
    }
    assert.ok(armed, "never reached a chopped two-box score state");

    const floatsBeforeReset = floatCount();
    $("new-match-top").click();
    if (!$("banner").hidden || !scoreValues().every((s) => s === 0)) {
      continue; // instant-win open: tracker laundered — re-arm
    }
    // A clean playing reset render, carrying the armed match's
    // scores in the tracker: it must not float or flash anything.
    assert.equal(
      floatCount(),
      floatsBeforeReset,
      "New match reset floated a spurious bomb penalty",
    );
    for (const box of $("scores").children) {
      assert.equal(box.animations.length, 0, "New match reset flashed a score box");
    }
    resetChecked = true;
  }
  assert.ok(resetChecked, "never got an armed state followed by a clean reset");

  // And a genuine mid-round chop still floats exactly one −N.
  let verified = false;
  for (let steps = 0; steps < 20000 && !verified; steps++) {
    if (settle() === "banner") {
      if (isMatchEndBanner()) $("new-match-btn").click();
      else $("continue-btn").click();
      continue;
    }
    const scoresBefore = scoreValues();
    const floatsBefore = floatCount();
    humanMove();
    if (settle() === "banner") continue; // round ended — not a mid-round span
    if (isChopDelta(scoresBefore, scoreValues())) {
      assert.equal(
        floatCount() - floatsBefore,
        1,
        "a genuine chop must float exactly one −N",
      );
      verified = true;
    }
  }
  assert.ok(verified, "no genuine chop occurred to verify the float against");
});

test("e2e: hand settle keys on layout, not pose — selection redraw animates nothing and reuses buttons (TASK 023)", async () => {
  await import("../src/main.js");
  $("new-match-top").click();
  settleToYourTurn();
  const handBtns = (): FakeElement[] => Array.from($("hand").children);
  const before = handBtns();
  assert.ok(before.length > 1, "need a hand to select from");
  const target = before[1];
  const targetId = target.dataset.cardId;
  // The fake's layout boxes are non-zero (slot index x 70px), and
  // this card's PAINTED box sits 15px above its slot — a hovered /
  // selected pose. The old painted-box settle read exactly that as
  // movement and dropped the card; the layout comparison must not.
  target._rect = { left: 70, top: -15, right: 134, bottom: 81, width: 64, height: 96 };
  const callsBefore = FakeElement.totalAnimateCalls;
  target.click(); // select
  const after = handBtns();
  assert.equal(after.length, before.length);
  assert.ok(
    after.every((btn, i) => btn === before[i]),
    "hand buttons must be reused across a selection redraw",
  );
  assert.ok(after[1].className.includes("sel"), "the clicked card is selected");
  assert.equal(
    FakeElement.totalAnimateCalls - callsBefore,
    0,
    "a selection-only redraw must start no animation (layout did not move)",
  );
  // A real layout move — Sort reverses the hand — DOES animate,
  // and the animation drives the CSS `translate` property so the
  // pose transform survives the slide.
  target.click(); // deselect
  const callsBeforeSort = FakeElement.totalAnimateCalls;
  $("sort-btn").click();
  assert.ok(
    FakeElement.totalAnimateCalls - callsBeforeSort > 0,
    "Sort must still settle-animate the moved cards",
  );
  const moved = handBtns().find((btn) => btn.dataset.cardId === targetId)!;
  const settleAnim = moved.animations[moved.animations.length - 1];
  const frames = settleAnim.keyframes as { translate?: string }[];
  assert.ok(
    frames[0].translate !== undefined && !("transform" in frames[0]),
    "settle animation must keyframe the translate property, not transform",
  );
});


// Feed engine-produced trick states through the real DOM adapter. The
// exported render entry point avoids exposing or mutating its live controller.
const pairRun = (ranks: Card["rank"][]): Card[] => ranks.flatMap((rank) =>
  [makeCard(rank, "spades"), makeCard(rank, "clubs")]);
const nines = createDeck().filter((card) => card.rank === "9");
const threePairs = pairRun(["4", "5", "6"]);
const fourPairs = pairRun(["4", "5", "6", "7"]);

function bombFixture(hand: Card[], target: Card[], leader = 3): ControllerState {
  const hands = [hand, [makeCard("J", "hearts")], [makeCard("Q", "hearts")],
    [makeCard("K", "hearts")]];
  hands[leader] = [...hands[leader], ...target];
  const trick = createTrickState(hands, { leader, openingLead: false });
  if (target.length) playCards(trick, leader, target);
  return { phase: "playing", match: createMatch(), trick, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null };
}

async function assertFlicker(state: ControllerState, expected: Card[]): Promise<void> {
  const { render } = await import("../src/main.js");
  const before = structuredClone(state);
  render(state);
  const marked = $("hand").children.filter((btn) => btn.className.split(/\s+/).includes("bombplayable"));
  assert.deepEqual(marked.map((btn) => btn.dataset.cardId).sort(), expected.map((card) => card.id).sort());
  assert.deepEqual(state, before, "presentation must not mutate game state");
  for (const id of ["seat-1", "seat-2", "seat-3"]) {
    assert.ok(!$(id).className.includes("bombplayable"), "CPU seats never flicker");
  }
}

test("e2e: playable bomb flicker vs single 2 — both bombs and every overlapping card", async () => {
  // Three 4s: every choice of pair belongs to a playable double run.
  const hand = [...threePairs, makeCard("4", "diamonds"), ...nines, makeCard("A", "hearts")];
  const state = bombFixture(hand, [makeCard("2", "spades")]);
  await assertFlicker(state, hand.filter((card) => card.rank !== "A"));
  const btn = $("hand").children.find((card) => card.dataset.cardId === nines[0].id)!;
  btn.click();
  const selected = $("hand").children.find((card) => card.dataset.cardId === nines[0].id)!;
  assert.ok(selected.className.split(/\s+/).includes("sel") && selected.className.split(/\s+/).includes("bombplayable"));
});

test("e2e: playable bomb flicker vs pair of 2s — four pairs and quads only", async () => {
  await assertFlicker(bombFixture([...fourPairs, ...nines], pairRun(["2"])), [...fourPairs, ...nines]);
  await assertFlicker(bombFixture([...threePairs, ...nines], pairRun(["2"])), nines);
});

// A bomb on the table as the target: seat 2 leads a single 2 and
// seat 3 bombs it, leaving the bomb as the play the human faces.
function bombOnBombFixture(hand: Card[], bomb: Card[]): ControllerState {
  const hands = [hand, [makeCard("J", "hearts")],
    [makeCard("Q", "hearts"), makeCard("2", "spades")],
    [makeCard("K", "hearts"), ...bomb]];
  const trick = createTrickState(hands, { leader: 2, openingLead: false });
  playCards(trick, 2, [makeCard("2", "spades")]);
  playCards(trick, 3, bomb);
  return { phase: "playing", match: createMatch(), trick, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null };
}

test("e2e: playable bomb flicker vs a bomb — only the bombs that answer it (TASK 021)", async () => {
  const tens = createDeck().filter((card) => card.rank === "10");
  const threes = createDeck().filter((card) => card.rank === "3");
  // A higher 3-pair run answers the 3-pair bomb; four 3s cannot
  // answer a pair-run bomb and stay dark. (The quad rank is kept
  // clear of the run's ranks — a quad on an adjacent rank would
  // extend the run into a 4-pair run and rightly flicker too.)
  const higherRun = pairRun(["7", "8", "9"]);
  await assertFlicker(
    bombOnBombFixture([...higherRun, ...threes, makeCard("A", "hearts")], threePairs),
    higherRun,
  );
  // The 4-pair double run bombs any bomb; the quad still stays dark.
  const fourPairsDH = (["4", "5", "6", "7"] as Card["rank"][]).flatMap((rank) =>
    [makeCard(rank, "diamonds"), makeCard(rank, "hearts")]);
  await assertFlicker(
    bombOnBombFixture([...fourPairsDH, ...tens], threePairs),
    fourPairsDH,
  );
});

test("e2e: comeback flicker uses engine eligibility and keeps the foil", async () => {
  const cases: [Card[], Card[]][] = [
    [[...threePairs, ...nines], nines],
    [[...fourPairs, ...nines], [...fourPairs, ...nines]],
  ];
  for (const [hand, expected] of cases) {
    const low = makeCard("3", "spades"), two = makeCard("2", "spades");
    const state = bombFixture(hand, [low]);
    const trick = state.trick!;
    trick.hands[1].push(two);
    passTurn(trick, 0);
    playCards(trick, 1, [two]);
    passTurn(trick, 2);
    passTurn(trick, 3);
    assert.equal(trick.currentPlayer, 0);
    await assertFlicker(state, expected);
    for (const btn of $("hand").children.filter((card) => card.className.split(/\s+/).includes("bombplayable"))) {
      assert.ok(btn.className.split(/\s+/).includes("bombhot"), "comeback foil remains");
    }
    passTurn(trick, 0);
    await assertFlicker(state, []);
  }
});

test("e2e: no bomb flicker without a beatable target or outside the human turn", async () => {
  const hand = [...threePairs, ...nines];
  await assertFlicker(bombFixture(hand, [], 0), []); // leading a quad is not bombing
  await assertFlicker(bombFixture(hand, [makeCard("A", "spades")]), []);
  await assertFlicker(bombFixture(hand, createDeck().filter((c) => c.rank === "2").slice(0, 3)), []);
  await assertFlicker(bombFixture(hand, [makeCard("2", "spades")], 2), []);
  const ended = bombFixture(hand, [makeCard("2", "spades")]);
  ended.phase = "roundEnd";
  await assertFlicker(ended, []);
});

test("e2e: flicker leaves the same hand DOM and state under reduced motion", async () => {
  const state = bombFixture([...threePairs, ...nines], [makeCard("2", "spades")]);
  await assertFlicker(state, [...threePairs, ...nines]);
  const handSnapshot = () => $("hand").children.map((btn) => ({
    id: btn.dataset.cardId, classes: btn.className, disabled: btn.disabled, text: btn.textContent,
  }));
  const normal = handSnapshot();
  (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) };
  try {
    await assertFlicker(state, [...threePairs, ...nines]);
    assert.deepEqual(handSnapshot(), normal);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hand \.card[^{}]*\{animation:none !important;/);
  const keyframes = css.match(/@keyframes bombflicker\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(keyframes);
  assert.ok(!/transform|box-shadow/.test(keyframes), "flicker leaves lift and foil geometry alone");
});

test("hand motion: shared transition and selected pose wins hover", () => {
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const hand = rules.filter((r) => r.selector.startsWith(".hand "));
  const transitions = hand.filter((r) => /transition:/.test(r.body));
  // TASK 023 disclosed update: the count goes 2 -> 3 because the
  // reduced-motion block gains `.hand .card{transition:none
  // !important}` — with buttons reused across redraws, selection
  // would otherwise glide there. Every pre-existing assertion
  // below keeps its strength; the rules are now found by content
  // because the reduced-motion rule shares the base selector and
  // sits earlier in the file.
  assert.equal(transitions.length, 3);
  const shared = transitions.find((r) => /transition:transform/.test(r.body))!;
  assert.equal(shared.selector, ".hand .card");
  assert.match(shared.body, /transition:transform \.13s ease, box-shadow \.13s ease;/);
  const dragging = transitions.find((r) => r.selector === ".hand .card.dragging")!;
  assert.match(dragging.body, /transition:none/);
  const reducedOff = transitions.filter((r) => /transition:none !important/.test(r.body));
  assert.equal(reducedOff.length, 1);
  assert.equal(reducedOff[0].selector, ".hand .card");
  const hover = hand.filter((r) => r.selector.includes(":hover"));
  assert.equal(hover.length, 1);
  assert.equal(hover[0].selector, ".hand .card:hover");
  const selected = hand.find((r) => r.selector === ".hand .card.sel")!;
  assert.ok(hand.indexOf(selected) > hand.indexOf(hover[0]));
  assert.match(selected.body, /transform:translateY\(-15px\) rotate\(0deg\);/);
  assert.match(selected.body, /background:#e8f5ff/);
  assert.match(selected.body, /0 0 0 3px var\(--blue\)/);
  assert.match(shared.body, /filter:none/);
  assert.ok(!hand.some((r) => r.selector.includes(":active")));
});

test("modal shell: no horizontal scroll; the banner scrolls in an inner box (TASK 027)", () => {
  const rawCss = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  // Strip comments before parsing rules: a comment above a rule would
  // otherwise be captured as part of its selector text.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  // The shell scrolls vertically only past the 88vh cap, and never
  // horizontally: overflow-x is pinned shut, not left to compute to
  // auto off the vertical rule.
  const shell = rules.find((r) => r.selector === ".modal")!;
  assert.ok(shell, ".modal rule exists");
  assert.match(shell.body, /max-height:88vh/);
  assert.match(shell.body, /overflow-y:auto/);
  assert.match(shell.body, /overflow-x:hidden/);
  // The banner's modal is a non-scrolling shell: padding moves to
  // the inner box, and the shell itself never scrolls.
  const bannerShell = rules.find((r) => r.selector === ".modal.scrollshell")!;
  assert.ok(bannerShell, ".modal.scrollshell rule exists");
  assert.match(bannerShell.body, /padding:0/);
  assert.match(bannerShell.body, /overflow:visible/);
  // The inner box scrolls instead — same cap (minus the shell's
  // border, so the banner's outer size is unchanged), same padding,
  // and never horizontally.
  const scrollbox = rules.find((r) => r.selector === ".scrollbox")!;
  assert.ok(scrollbox, ".scrollbox rule exists");
  assert.match(scrollbox.body, /max-height:calc\(88vh - 4px\)/);
  assert.match(scrollbox.body, /overflow-y:auto/);
  assert.match(scrollbox.body, /overflow-x:hidden/);
  assert.match(scrollbox.body, /padding:26px 22px/);
  // The burst itself is untouched, declaration for declaration: it
  // stays the modal's ::before in its original layer. It no longer
  // grows scrollbars because it is the scroller's SIBLING now, not
  // its child — no part of it sits inside the .scrollbox subtree.
  const modalOn = rules.find((r) => r.selector === ".modal.instantwin")!;
  assert.ok(modalOn, ".modal.instantwin rule exists");
  assert.match(modalOn.body, /position:relative/);
  assert.match(modalOn.body, /z-index:0/);
  const burst = rules.find((r) => r.selector === ".modal.instantwin::before")!;
  assert.ok(burst, "burst rule exists on the modal");
  assert.match(burst.body, /position:absolute/);
  assert.match(burst.body, /inset:-34px/);
  assert.match(burst.body, /border-radius:50%/);
  assert.match(burst.body, /z-index:-1/);
  assert.match(burst.body, /radial-gradient\(circle,rgba\(255,197,48,\.55\) 0%,rgba\(255,197,48,\.18\) 42%,transparent 68%\)/);
  assert.match(burst.body, /animation:burst \.9s ease-out both/);
  // Burst keyframes untouched: same scale/opacity arc.
  const keyframes = css.match(/@keyframes burst\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(keyframes);
  assert.ok(keyframes.includes("0%{opacity:0;transform:scale(.55);}"));
  assert.ok(keyframes.includes("30%{opacity:1;}"));
  assert.ok(keyframes.includes("100%{opacity:0;transform:scale(1.12);}"));
  // Reduced motion still kills the burst.
  assert.match(rawCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.modal\.instantwin::before[^{}]*\{animation:none !important;/);
  // The banner's shipped markup: shell outside, scrollbox inside,
  // content inside that. (This harness's fake DOM is a flat id
  // registry, so the nesting is pinned here on the shipped HTML;
  // the real hierarchy is exercised by the browser probes in the
  // task's proof bar.)
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(html.includes(
    '<div class="overlay" id="banner" hidden>\n' +
    '      <div class="modal scrollshell">\n' +
    '        <div class="scrollbox">\n' +
    '          <h2 id="banner-title"></h2>',
  ), "banner modal is a shell around a scrollbox");
});
