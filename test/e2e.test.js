import test from "node:test";
import assert from "node:assert/strict";
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

class FakeText {
  constructor(text) {
    this._text = text;
  }
  get textContent() {
    return this._text;
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this._text = "";
    this._classes = new Set();
    this.listeners = {};
    this.disabled = false;
    this.hidden = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.style = {};
    this.attrs = {};
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
  appendChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    this.children.push(node);
    return node;
  }
  insertBefore(node, ref) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }
  getBoundingClientRect() {
    return this._rect ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  _syncClass() {
    this._className = [...this._classes].join(" ");
  }
  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
    this._syncClass();
  }
  get className() {
    return this._className ?? "";
  }
  set textContent(value) {
    this.children = [];
    this._text = value ?? "";
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join("");
  }
  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === "string") node = new FakeText(node);
      this.children.push(node);
    }
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  click() {
    for (const fn of this.listeners.click ?? []) fn({});
  }
}

const ELEMENT_IDS = [
  "scores", "seat-1", "seat-2", "seat-3", "trick-info", "to-beat",
  "message", "you-area", "you-header", "hand", "play-btn", "pass-btn",
  "hint-btn", "log", "banner", "banner-title", "banner-body",
  "continue-btn", "new-match-btn", "start-screen", "start-btn",
  "round-num", "new-match-top", "sort-btn", "clear-btn",
];

const registry = new Map();
globalThis.document = {
  getElementById: (id) => {
    if (!registry.has(id)) registry.set(id, new FakeElement("div"));
    return registry.get(id);
  },
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (text) => new FakeText(text),
};

// ---------- fake timers + seeded deals ----------

const timerQueue = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => {
  timerQueue.push(fn);
  return timerQueue.length;
};
Math.random = seededRng(2026);

const $ = (id) => globalThis.document.getElementById(id);

function pumpTimers() {
  let guard = 0;
  while (timerQueue.length > 0) {
    if (++guard > 100000) throw new Error("timer queue did not drain");
    timerQueue.shift()();
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

function sortArrow() {
  return $("sort-btn").children.find((child) => child.className === "sort-arrow");
}

// Click through any round banners until it is the human's move.
function settleToYourTurn() {
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

test("e2e: start gate — nothing is dealt or running until Start Game is clicked", async () => {
  // The real page's Sort button contains an arrow span; mirror it in
  // the fake DOM before the page module grabs its elements.
  const arrow = document.createElement("span");
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
  assert.match($("sort-btn").getAttribute("aria-label"), /low to high ascending/);

  // First tap: descending — the rendered order is the exact reverse.
  $("sort-btn").click();
  assert.deepEqual(handOrder(), [...ascending].reverse());
  assert.equal(sortArrow().textContent, "↓");
  assert.match($("sort-btn").title, /Sorted high to low \(descending\)/);
  assert.match($("sort-btn").getAttribute("aria-label"), /high to low descending/);

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

  globalThis.setTimeout = realSetTimeout;
});

test("e2e: the pile shows a muted 'Before that' line for the play the current one beat", async () => {
  await import("../src/main.js"); // already booted; a match is in progress
  // The previous test restored real timers; reinstall the manual queue.
  globalThis.setTimeout = (fn) => {
    timerQueue.push(fn);
    return timerQueue.length;
  };
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
function fire(el, type, ev = {}) {
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
function byValue(a, b) {
  const rankDiff =
    RANK_SEQ.indexOf(a.slice(0, -1)) - RANK_SEQ.indexOf(b.slice(0, -1));
  if (rankDiff !== 0) return rankDiff;
  return SUIT_SEQ.indexOf(a.at(-1)) - SUIT_SEQ.indexOf(b.at(-1));
}

function waitReal(ms) {
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
