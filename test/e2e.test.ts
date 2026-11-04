import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { createDeck, makeCard, type Card } from "../src/engine/cards.js";
import { createTrickState, playCards, passTurn } from "../src/engine/trick.js";
import { createMatch } from "../src/engine/match.js";
import { emptyTrickView, SEAT_NAMES } from "../src/ui/model.js";
import { newDeal } from "../src/engine/deal.js";
import { detectInstantWin } from "../src/engine/instantWin.js";
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
  "odds-btn-top", "odds-overlay", "odds-close",
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

// ---------- fake localStorage (TASK 031) ----------
// Installed before main.js is ever imported; the persistence
// tests steer it per test (contents + a throws mode simulating
// unavailable storage).
class FakeStorage {
  map = new Map<string, string>();
  throws = false;
  getItem(key: string): string | null {
    if (this.throws) throw new Error("storage unavailable");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throws) throw new Error("storage unavailable");
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    if (this.throws) throw new Error("storage unavailable");
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}
const fakeStorage = new FakeStorage();
(globalThis as { localStorage: unknown }).localStorage = fakeStorage;
const SCORE_KEY = "thirteen.matchScore.v1";

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

// TASK 026 — the locked V4 icon set (card only, full frame, bigger
// heart). Sizes and sha256 of the owner-approved masters.
const LOCKED_ICONS: ReadonlyArray<{ file: string; bytes: number; sha256: string }> = [
  { file: "favicon.svg", bytes: 773, sha256: "f44209786a4ec1fafc3e4d4bb6b4f16e223b1f172fe628bc7cd99108349cc680" },
  { file: "favicon-32.png", bytes: 1230, sha256: "751a78224305f69c0cb7f9420d39b83dbecf3aa7a268e078a7705110d25a6e22" },
  { file: "apple-touch-icon.png", bytes: 13120, sha256: "b4f224c45f452256edf50e09ae493b4271dfb44aa705692508d20035aeaef44c" },
];

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

test("e2e: build ships all three unchanged icon assets (TASK 020)", () => {
  const root = new URL("../../", import.meta.url);
  execFileSync(process.execPath, ["build.mjs"], { cwd: root, stdio: "inherit" });
  for (const icon of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
    const source = readFileSync(new URL(icon, root));
    assert.ok(source.length > 0, `${icon} must not be empty`);
    assert.deepEqual(readFileSync(new URL(`dist/${icon}`, root)), source);
  }
  // TASK 026: the dist copies are the locked V4 masters, byte for byte.
  for (const { file, bytes, sha256 } of LOCKED_ICONS) {
    const shipped = readFileSync(new URL(`dist/${file}`, root));
    assert.equal(shipped.length, bytes, `dist/${file} size`);
    assert.equal(sha256Hex(shipped), sha256, `dist/${file} sha256`);
  }
});

test("e2e: icon sources are the locked V4 masters (TASK 026)", () => {
  const root = new URL("../../", import.meta.url);
  for (const { file, bytes, sha256 } of LOCKED_ICONS) {
    const source = readFileSync(new URL(file, root));
    assert.equal(source.length, bytes, `${file} size`);
    assert.equal(sha256Hex(source), sha256, `${file} sha256`);
  }
  // favicon.svg is byte-identical to the SVG block printed in the task file.
  const taskFile = readFileSync(new URL("tasks/TASK-026-favicon-v4.md", root), "utf8");
  const block = taskFile.match(/```svg\n([\s\S]*?)\n```/)?.[1];
  assert.ok(block, "task file must carry the locked SVG block");
  assert.equal(readFileSync(new URL("favicon.svg", root), "utf8"), block);
});

test("e2e: shipped favicon.svg is card only — no tile, no gradient, transparent (TASK 026)", () => {
  const svg = readFileSync(new URL("../../favicon.svg", import.meta.url), "utf8");
  // No gradient anywhere (the Task 020 tile was a linearGradient fill).
  assert.ok(!/gradient/i.test(svg), "no gradient element");
  assert.ok(!svg.includes("url(#"), "no paint-server reference");
  assert.ok(!svg.includes("<defs"), "no defs block");
  // No tile rect: the only rect is the card face itself.
  const rects = svg.match(/<rect\b[^>]*>/g) ?? [];
  assert.equal(rects.length, 1, "exactly one rect — the card");
  assert.ok(rects[0]?.includes('x="136" y="72" width="240" height="368"'), "the one rect is the card");
  assert.ok(!/<rect\b[^>]*width="512"/.test(svg), "no full-canvas tile rect");
  // Transparent background: the root <svg> paints nothing itself, and
  // its first child is the card group (no backdrop drawn before it).
  const rootTag = svg.match(/^<svg\b[^>]*>/)?.[0];
  assert.ok(rootTag, "starts with the root svg tag");
  assert.ok(!/\b(fill|style|background)\s*=/.test(rootTag), "root svg sets no fill/style/background");
  assert.ok(svg.slice(rootTag.length).startsWith("<g "), "first child is the card group");
  assert.ok(!/background/i.test(svg), "no background styling");
  // V4: the card group is scaled 1.27 about the centre; big heart at 1.3.
  assert.ok(svg.includes('transform="translate(256 256) scale(1.27) translate(-256 -256)"'));
  assert.ok(svg.includes('transform="translate(238.0 275.0) scale(1.3)"'));
});

test("e2e: PNG icons are RGBA at their sizes with a transparent corner (TASK 026)", () => {
  const root = new URL("../../", import.meta.url);
  for (const [file, size] of [["favicon-32.png", 32], ["apple-touch-icon.png", 180]] as const) {
    const png = readFileSync(new URL(file, root));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), `${file} signature`);
    assert.equal(png.toString("latin1", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), size, `${file} width`);
    assert.equal(png.readUInt32BE(20), size, `${file} height`);
    assert.equal(png[24], 8, `${file} bit depth`);
    assert.equal(png[25], 6, `${file} colour type RGBA`);
    assert.equal(png[28], 0, `${file} not interlaced`);
    // Gather IDAT data and inflate it. For pixel (0,0) every PNG filter
    // predictor is zero, so its filtered bytes are the raw RGBA bytes.
    const idat: Buffer[] = [];
    for (let at = 8; at < png.length; ) {
      const length = png.readUInt32BE(at);
      const type = png.toString("latin1", at + 4, at + 8);
      if (type === "IDAT") idat.push(png.subarray(at + 8, at + 8 + length));
      at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    assert.equal(raw.length, size * (1 + size * 4), `${file} scanline data size`);
    assert.equal(raw[4], 0, `${file} corner pixel is fully transparent`);
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

test("e2e: bomb odds card — header button only; the start screen has none (TASK 022, button removed in TASK 030)", async () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="odds-overlay" hidden'), "odds card must ship hidden");
  // Its own button, right next to How to play, in the header.
  assert.ok(html.includes(
    '<button class="ghost small" id="help-btn-top" type="button">How to play</button>\n' +
    '          <button class="ghost small" id="odds-btn-top" type="button">Bomb odds</button>',
  ), "header: Bomb odds sits next to How to play");
  // TASK 030 pin: the start-screen button is gone, for good. The
  // start action row is back to exactly Start Game + How to play.
  assert.ok(!html.includes("odds-btn-start"), "no start-screen Bomb odds button anywhere in the page");
  const startScreen = html.slice(html.indexOf("<h2>13 — Tiến Lên</h2>"), html.indexOf('id="banner"'));
  assert.ok(startScreen.includes('id="start-btn"'), "start screen keeps Start Game");
  assert.ok(startScreen.includes('id="help-btn-start"'), "start screen keeps How to play");
  assert.ok(!startScreen.includes("odds"), "the start action row carries no odds control");
  // The card's content is unchanged (engine-derived figures, TASK 022).
  assert.ok(html.includes('<tr><td>3-pair double run</td><td class="num">8.36%</td><td class="num">1 in 12</td></tr>'));
  assert.ok(html.includes('<tr><td>Six pairs</td><td class="num">0.43%</td><td class="num">1 in 231</td></tr>'));
  assert.ok(html.includes('<tr class="any"><td>Any instant win</td><td class="num">0.83%</td><td class="num">1 in 121</td></tr>'));
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

  // The header button opens and closes the card from the start
  // screen too (the header is always in the DOM), and nothing
  // about the page changes across the open/close cycle.
  assert.equal($("odds-overlay").hidden, true);
  assert.equal($("start-screen").hidden, false);
  const before = pageSnapshot();
  $("odds-btn-top").click();
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
  $("odds-btn-top").click();
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
  // TASK 036: the muting moved from an inline style into CSS with
  // the identical value — the line carries the rule's class, no
  // inline opacity, and the rule sets exactly .65.
  assert.ok(seen.className.split(/\s+/).includes("prior"), "the Before-that line carries the muted class");
  assert.equal(seen.style.opacity, undefined, "no inline opacity remains");
  const pileCss = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const muted = [...pileCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((m) => m[1].trim() === ".pile .leadline.prior");
  assert.ok(muted, "the .pile .leadline.prior rule exists");
  assert.equal(muted[2], "opacity:.65;");
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

// TASK 036: a ControllerState carries the controller's explicit
// round/trick identity. Each synthetic fixture below is a freshly
// dealt round (before TASK 036 that was signalled by its new trick
// object), so it mints ids no controller-driven state ever uses.
let fixtureIdSeq = 1_000_000;
function freshIds(): { roundId: number; trickId: number } {
  fixtureIdSeq += 1;
  return { roundId: fixtureIdSeq, trickId: fixtureIdSeq };
}

test("e2e: LOCKED stamp plays once per lockout — stampplay only on the newly-locked render (TASK 028)", async () => {
  const { render } = await import("../src/main.js");
  // A trick where Mina (seat 1) has just passed: the human leads
  // the 3 of spades, Mina passes and locks.
  const lockState = (): ControllerState => {
    const hands = [
      [makeCard("3", "spades"), makeCard("9", "clubs")],
      [makeCard("5", "hearts"), makeCard("6", "hearts")],
      [makeCard("7", "hearts")],
      [makeCard("8", "hearts")],
    ];
    const trick = createTrickState(hands, { leader: 0, openingLead: true });
    playCards(trick, 0, [makeCard("3", "spades")]);
    passTurn(trick, 1);
    return { phase: "playing", match: createMatch(), trick, message: "", log: [],
      trickView: emptyTrickView(), roundSummary: null, ...freshIds() };
  };
  const seatClasses = (): string[] => $("seat-1").className.split(/\s+/);

  // The lock render itself carries the stamp animation.
  const s1 = lockState();
  render(s1);
  assert.ok(seatClasses().includes("lockedout"), "Mina is locked out");
  assert.ok(seatClasses().includes("stampplay"), "the lock render carries the stamp animation");

  // Any later re-render of the SAME trick while she stays locked
  // — which is what every owner click (selection, Hint, Sort,
  // Clear) produces — must show the stamp settled.
  render(s1);
  assert.ok(seatClasses().includes("lockedout"), "still locked out");
  assert.ok(!seatClasses().includes("stampplay"), "re-renders must not replay the stamp");

  // A new trick where she locks again stamps again, once, and
  // settles on its next re-render.
  const s2 = lockState();
  render(s2);
  assert.ok(seatClasses().includes("stampplay"), "a new lockout stamps again");
  render(s2);
  assert.ok(!seatClasses().includes("stampplay"), "and settles again on the next render");
});

test("locked stamp: stampIn hangs on the stampplay gate only, look unchanged (TASK 028)", () => {
  const rawCss = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const base = rules.find((r) => r.selector === ".seat.lockedout .opp::after")!;
  assert.ok(base, "the stamp's base rule exists");
  assert.match(base.body, /content:"LOCKED"/);
  assert.ok(!/animation:/.test(base.body), "the base stamp carries no animation — it is the settled look");
  const gated = rules.find((r) => r.selector === ".seat.lockedout.stampplay .opp::after")!;
  assert.ok(gated, "the stampplay gate rule exists");
  assert.match(gated.body, /animation:stampIn \.28s cubic-bezier\(\.2,1\.4,\.4,1\) both;/);
  const frames = css.match(/@keyframes stampIn\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(frames, /from\{opacity:0;.*scale\(2\.1\)/);
  assert.match(frames, /to\{opacity:1;.*scale\(1\);/);
  // Reduced motion still suppresses the stamp animation: the
  // reduced block's animation:none rule names the gated selector.
  const reduced = rules.filter((r) => /animation:none !important/.test(r.body));
  assert.ok(
    reduced.some((r) => r.selector.includes(".seat.lockedout.stampplay .opp::after")),
    "reduced-motion block must cover the gated stamp selector",
  );
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
    trickView: emptyTrickView(), roundSummary: null, ...freshIds() };
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
    trickView: emptyTrickView(), roundSummary: null, ...freshIds() };
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

test("bomb foil: golden band, sweep and ring unchanged (TASK 034)", () => {
  const rawCss = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  // Strip comments before parsing rules: a comment above a rule would
  // otherwise be captured as part of its selector text.
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const foil = rules.find((r) => r.selector === ".hand .card.bombhot::after")!;
  assert.ok(foil, ".hand .card.bombhot::after rule exists");
  // The owner-approved V1 gradient, value for value: golds only,
  // wide band, pale white-gold peak.
  assert.ok(
    foil.body.includes(
      "background:linear-gradient(115deg, transparent 24%, rgba(184,119,0,.35) 37%, rgba(255,178,35,.72) 47%, rgba(255,246,200,.95) 54%, rgba(255,178,35,.72) 61%, rgba(184,119,0,.35) 70%, transparent 82%);",
    ),
    "the foil is the approved golden gradient",
  );
  // No rainbow stop survives: every rgba() in the foil is a gold.
  const stops = [...foil.body.matchAll(/rgba\((\d+),(\d+),(\d+),[^)]*\)/g)]
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  assert.equal(stops.length, 5);
  for (const [r, g, b] of stops) {
    assert.ok(r >= g && g >= b, `rgb(${r},${g},${b}) is a gold (r >= g >= b), not pink or blue`);
  }
  // Frozen: geometry, sweep animation, and its keyframes.
  assert.match(foil.body, /content:"";position:absolute;inset:-40%;/);
  assert.match(foil.body, /animation:foil 1\.6s ease-in-out infinite;/);
  assert.match(foil.body, /pointer-events:none;/);
  assert.match(
    rawCss,
    /@keyframes foil\{ 0%\{transform:translateX\(-55%\) rotate\(0\.001deg\);\} 55%\{transform:translateX\(45%\) rotate\(0\.001deg\);\} 100%\{transform:translateX\(45%\) rotate\(0\.001deg\);\} \}/,
  );
  // Frozen: the gold ring + glow and the animation slots.
  const hot = rules.find((r) => r.selector === ".hand .card.bombhot")!;
  assert.ok(hot, ".hand .card.bombhot rule exists");
  assert.match(hot.body, /box-shadow:0 8px 16px rgba\(5,20,15,\.4\), 0 0 0 3px var\(--gold\), 0 0 22px rgba\(255,178,35,\.65\);/);
  assert.match(hot.body, /animation:bombglow 1\.1s ease-in-out infinite alternate;/);
  const both = rules.find((r) => r.selector === ".hand .card.bombhot.bombplayable")!;
  assert.ok(both, ".hand .card.bombhot.bombplayable rule exists");
  assert.equal(both.body, "animation:bombglow 1.1s ease-in-out infinite alternate, bombflicker 1.2s ease-in-out infinite;");
  // The comment above the foil describes the gold, not a rainbow.
  assert.ok(!/holographic/i.test(rawCss), "no stale holographic-sheen comment");
  assert.match(rawCss, /\/\* Foil treatment for live jump-back bombs — golden foil/);
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
  // The burst stays the modal's ::before in its original layer. It
  // no longer grows scrollbars because it is the scroller's SIBLING
  // now, not its child — no part of it sits inside the .scrollbox
  // subtree. (TASK 033 later stretched its TIMING by design —
  // burstHold 2.4s with a full-glow plateau; position, inset,
  // gradient and layer are still the declarations pinned here.)
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
  assert.match(burst.body, /animation:burstHold 2\.4s ease-out both/);
  // burstHold keyframes (TASK 033): the burst arc with a plateau
  // at full glow — reaches opacity 1 at 20%, still 1 at 55%, then
  // fades to the same end state.
  const holdFrames = css.match(/@keyframes burstHold\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(holdFrames);
  assert.ok(holdFrames.includes("0%{opacity:0;transform:scale(.55);}"));
  assert.ok(holdFrames.includes("20%{opacity:1;transform:scale(1);}"));
  assert.ok(holdFrames.includes("55%{opacity:1;transform:scale(1.05);}"));
  assert.ok(holdFrames.includes("100%{opacity:0;transform:scale(1.12);}"));
  // Burst keyframes untouched: same scale/opacity arc (the TASK
  // 033 celebration beat's burst still uses them).
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

// ---------- TASK 031: score persistence ----------

// Play from wherever the game is until a round-end banner shows.
function driveToRoundBanner031(): void {
  for (let steps = 0; steps < 20000; steps++) {
    const phase = settle();
    if (phase === "banner") {
      assert.ok(!isMatchEndBanner(), "round ended the match unexpectedly early");
      return;
    }
    humanMove();
  }
  throw new Error("never reached a round banner");
}

test("e2e: score persistence — nothing saved at 0-0 round 1; standings saved when the round lands (TASK 031)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  $("new-match-top").click();
  settle();
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.equal(
    fakeStorage.map.has(SCORE_KEY), false,
    "a fresh 0-0 round-1 board writes no save",
  );
  driveToRoundBanner031();
  const raw = fakeStorage.map.get(SCORE_KEY);
  assert.ok(raw, "a save exists once points and the round have moved");
  const saved = JSON.parse(raw) as { scores: number[]; round: number };
  assert.deepEqual(saved.scores, scoreValues(), "the save holds the board exactly");
  assert.equal(saved.round, 2, "the save holds the round the match advanced to");
  assert.ok(saved.scores.some((s) => s !== 0), "the saved board is a real one");
});

test("e2e: score persistence — Start restores points and round; scoring accumulates on top (TASK 031)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  $("start-btn").click();
  settle();
  assert.deepEqual(scoreValues(), [5, -2, 3, 0], "points restored exactly (negatives included)");
  assert.equal($("round-num").textContent, "4", "the saved round is the round dealt");
  assert.deepEqual(
    JSON.parse(fakeStorage.map.get(SCORE_KEY)!) as unknown,
    { scores: [5, -2, 3, 0], round: 4 },
    "the save survives the restore and still holds the restored standings",
  );
  // Play the restored round out: the board moves on top of the
  // restored values. Round scoring is zero-sum (deltas sum to 0;
  // penalties and bomb penalties are transfers), so the restored
  // total is invariant, and the persisted round advances to 5 —
  // from a fresh start one round could only ever reach round 2.
  driveToRoundBanner031();
  const after = scoreValues();
  assert.equal(after.reduce((a, b) => a + b, 0), 6, "restored total preserved by zero-sum scoring");
  const saved = JSON.parse(fakeStorage.map.get(SCORE_KEY)!) as { scores: number[]; round: number };
  assert.deepEqual(saved.scores, after, "the save tracks the accumulated board");
  assert.equal(saved.round, 5, "the restored match advanced from round 4 to round 5");
});

test("e2e: score persistence — New Match clears the save; match end clears it (TASK 031)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  $("start-btn").click();
  settle();
  assert.ok(fakeStorage.map.has(SCORE_KEY), "save present mid-match");
  $("new-match-top").click();
  settle();
  assert.equal(fakeStorage.map.has(SCORE_KEY), false, "New Match clears the save");
  assert.deepEqual(scoreValues(), [0, 0, 0, 0]);
  assert.equal($("round-num").textContent, "1");
  // A full match with saving on: the save exists mid-match and is
  // gone once the match is decided.
  let sawSave = false;
  for (let steps = 0; steps < 20000; steps++) {
    const phase = settle();
    if (fakeStorage.map.has(SCORE_KEY)) sawSave = true;
    if (phase === "banner") {
      if (isMatchEndBanner()) break;
      $("continue-btn").click();
      continue;
    }
    humanMove();
  }
  assert.ok(isMatchEndBanner(), "the driven match completed");
  assert.ok(sawSave, "the save was written during the match");
  assert.equal(fakeStorage.map.has(SCORE_KEY), false, "match end clears the save");
});

test("e2e: score persistence — corrupt and out-of-range saves are discarded (TASK 031)", async () => {
  await import("../src/main.js");
  const badPayloads = [
    "not json at all",
    JSON.stringify({ scores: [1, 2, 3], round: 2 }), // three seats
    JSON.stringify({ scores: [0, 0, 0, 13], round: 2 }), // above the cap (owner band A)
    JSON.stringify({ scores: [0, 0, 0, -100], round: 2 }), // below the floor (owner band A)
    JSON.stringify({ scores: [0, 0, 0, 1.5], round: 2 }), // non-integer points
    JSON.stringify({ scores: ["5", 0, 0, 0], round: 2 }), // wrong value type
    JSON.stringify({ scores: [5, 0, 0, 0], round: 0 }), // round below 1
    JSON.stringify({ scores: [5, 0, 0, 0], round: 2.5 }), // non-integer round
    JSON.stringify({ scores: [5, 0, 0, 0] }), // missing round
    JSON.stringify([5, 0, 0, 0]), // wrong shape entirely
  ];
  for (const payload of badPayloads) {
    fakeStorage.clear();
    fakeStorage.throws = false;
    fakeStorage.setItem(SCORE_KEY, payload);
    $("start-btn").click();
    // Judge the restore decision on the immediate post-click
    // render, before any pumped CPU chain can move points. A
    // discarded save starts a FRESH match, which shows exactly
    // one of two boards: a quiet 0-0 at round 1, or — when the
    // fresh deal itself is an instant win — the instant-win
    // deltas (+6/-2/-2/-2) at round 2. Any restored state (the
    // payload's points at the payload's round, or those points
    // shifted by an instant win on the restored deal) falls
    // outside both shapes.
    const scores = scoreValues();
    const pill = $("round-num").textContent;
    const freshQuiet = pill === "1" && scores.every((s) => s === 0);
    const freshInstant = pill === "2" &&
      [...scores].sort((a, b) => a - b).join(",") === "-2,-2,-2,6";
    assert.ok(
      freshQuiet || freshInstant,
      `discarded, fresh start: ${payload} (got ${scores.join("/") || "none"} at round ${pill})`,
    );
    // Anything left in the store is a NEW save of that fresh
    // board — never the bad payload kept.
    const kept = fakeStorage.map.get(SCORE_KEY);
    if (kept !== undefined) {
      assert.deepEqual(JSON.parse(kept), { scores, round: Number(pill) });
    }
  }
  // The band's edges are inclusive: -99 and 12 restore fine. A
  // restored board always carries a magnitude no fresh board can
  // reach (fresh values live in [-2, 6]; seat 1 sits at -99 or
  // -99 shifted by an instant win), at round 9 (or 10 if the
  // restored deal itself instant-won).
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [12, -99, 0, 5], round: 9 }));
  $("start-btn").click();
  const edgeScores = scoreValues();
  const edgePill = $("round-num").textContent;
  assert.ok(edgePill === "9" || edgePill === "10", `band edges restore the round (got ${edgePill})`);
  assert.ok(
    Math.max(...edgeScores.map((s) => Math.abs(s))) >= 10,
    `band edges restore the points (got ${edgeScores.join("/")})`,
  );
  if (edgePill === "9") assert.deepEqual(edgeScores, [12, -99, 0, 5], "exact board when no instant win intervenes");
  fakeStorage.clear();
});

test("e2e: score persistence — storage that throws on every access never breaks a match (TASK 031)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = true;
  try {
    $("start-btn").click(); // the read path throws internally — swallowed
    for (let steps = 0; steps < 20000; steps++) {
      const phase = settle();
      if (phase === "banner") {
        if (isMatchEndBanner()) break;
        $("continue-btn").click();
        continue;
      }
      humanMove();
    }
    assert.ok(isMatchEndBanner(), "a full match completes with storage throwing throughout");
  } finally {
    fakeStorage.throws = false;
    fakeStorage.clear();
  }
});

test("e2e: finish medals — 1st gold, 2nd silver, 3rd/4th keep the green pill (TASK 029)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  // Play a full round: at the round banner every seat has a
  // finish place.
  $("new-match-top").click();
  for (let steps = 0; steps < 20000; steps++) {
    const phase = settle();
    if (phase === "banner") {
      assert.ok(!isMatchEndBanner(), "round one of a fresh match cannot end the match");
      break;
    }
    humanMove();
  }
  // Scoreboard boxes are in seat order; the FINISH place of each
  // seat is on its meta line ("Finished 1st"…). Read each box's
  // name-row marker and group by the place it claims.
  const byPlace: Record<string, { classes: string; text: string; label: string | null; role: string | null }> = {};
  const boxes = $("scores").children;
  assert.equal(boxes.length, 4);
  for (const box of boxes) {
    const meta = box.children.find((c) => (c.className ?? "").split(/\s+/).includes("meta"));
    const place = /^Finished (\d(?:st|nd|rd|th))$/.exec(meta?.textContent ?? "")?.[1];
    assert.ok(place, `every seat shows a finish place (meta: ${meta?.textContent})`);
    const nm = box.children.find((c) => (c.className ?? "").split(/\s+/).includes("nm"));
    const marker = nm?.children.find((c) => {
      const cls = (c.className ?? "").split(/\s+/);
      return cls.includes("medal") || (cls.includes("badge") && cls.includes("done"));
    });
    assert.ok(marker, `${place} has a finish marker`);
    byPlace[place] = {
      classes: marker.className,
      text: marker.textContent,
      label: marker.getAttribute("aria-label"),
      role: marker.getAttribute("role"),
    };
  }
  // 1st: gold medal, numeral 1, accessible name for the place.
  assert.equal(byPlace["1st"].classes, "medal gold");
  assert.equal(byPlace["1st"].text, "1");
  assert.equal(byPlace["1st"].label, "Finished 1st");
  assert.equal(byPlace["1st"].role, "img");
  // 2nd: silver medal, numeral 2.
  assert.equal(byPlace["2nd"].classes, "medal silver");
  assert.equal(byPlace["2nd"].text, "2");
  assert.equal(byPlace["2nd"].label, "Finished 2nd");
  // 3rd and 4th: the green pill, exactly as before.
  assert.equal(byPlace["3rd"].classes, "badge done");
  assert.equal(byPlace["3rd"].text, "3rd");
  assert.equal(byPlace["3rd"].label, null);
  assert.equal(byPlace["4th"].classes, "badge done");
  assert.equal(byPlace["4th"].text, "4th");
  // The medal styling ships: gold and silver discs, the ribbon,
  // and the pill footprint (19px) so the row does not shift.
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.medal\{[^}]*width:19px;height:19px;border-radius:50%;/);
  assert.match(css, /\.medal\.gold\{background:linear-gradient\(180deg, var\(--gold-bright\), var\(--gold\)\);/);
  assert.match(css, /\.medal\.silver\{background:linear-gradient\(180deg, #f4f7f9, #b7c2ca\);/);
  assert.match(css, /\.medal::before\{[^}]*linear-gradient\(90deg, var\(--red\) 0 50%, var\(--blue\) 50% 100%\);/);
  // The green pill itself is untouched for the lower places.
  assert.match(css, /\.badge\.done\{background:var\(--green\);color:#06350f;\}/);
});

test("e2e: responsive stage zoom — capped factor, phone floor, compensated motion math (TASK 024)", async () => {
  const main = await import("../src/main.js");
  const setWidth = (innerWidth: number | undefined): void => {
    (globalThis as { window?: unknown }).window = {
      innerWidth,
      matchMedia: () => ({ matches: false }),
    };
  };
  try {
    // The factor mirrors the CSS clamp: viewport width over the
    // 1080px design width, floored at 1, capped at 1.5.
    setWidth(360);
    assert.equal(main.stageScale(), 1, "phone width: no scaling (today's presentation)");
    setWidth(1080);
    assert.equal(main.stageScale(), 1, "design width: exactly 1");
    setWidth(1440);
    assert.ok(Math.abs(main.stageScale() - 4 / 3) < 1e-9, "laptop width: proportional growth");
    setWidth(1620);
    assert.equal(main.stageScale(), 1.5, "cap point: exactly 1.5");
    setWidth(2560);
    assert.equal(main.stageScale(), 1.5, "very large: still capped at 1.5");
    setWidth(undefined);
    assert.equal(main.stageScale(), 1, "no viewport (harness): 1");
  } finally {
    setWidth(1024);
  }
  // The shipped CSS carries the same clamp on the stage, and the
  // phone presentation rules are untouched.
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.wrap\{max-width:1080px;margin:0 auto;padding:16px 14px 48px;zoom:clamp\(1, calc\(100vw \/ 1080px\), 1\.5\);}/,
    "the stage zoom declaration ships as designed",
  );
  assert.match(
    css,
    /@media \(max-width:640px\)\{[\s\S]*?\.card\{width:48px;height:68px;\}/,
    "the phone card size is unchanged",
  );
  // The two in-stage rect->translate conversions divide by the
  // factor (the fx layer lives outside the stage in client
  // space and needs none).
  // (TASK 036: the two conversions now live in src/dom/fx.ts and
  // src/dom/hand.ts, split out of src/main.ts.)
  const fxSrc = readFileSync(new URL("../../src/dom/fx.ts", import.meta.url), "utf8");
  const handSrc = readFileSync(new URL("../../src/dom/hand.ts", import.meta.url), "utf8");
  assert.match(fxSrc, /\(src\.left - dst\.left\) \/ stageScale\(\)/, "pile-mini FLIP compensates");
  assert.match(handSrc, /\(dragState\.x - dragState\.startX\) \/ stageScale\(\)/, "drag tracking compensates");
});

// TASK 025 helpers: parse the shipped CSS into rules (comments
// stripped) and measure colors the way WCAG does.
function task025Rules(): { css: string; rules: { selector: string; body: string }[] } {
  const rawCss = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  return { css, rules };
}
function task025Rgb(hex: string): [number, number, number] {
  assert.match(hex, /^#[0-9a-f]{6}$/);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function task025Contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = task025Rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function task025Hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = task025Rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

test("utility buttons: the button.ghost family is warm gold from the trim, with dark legible ink (TASK 025)", () => {
  // Inventory, pinned on the shipped markup: eight button.ghost
  // elements — the controls row, the header's .ghost.small trio,
  // and the start screen's How to play.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const ghostIds = [...html.matchAll(/<button\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /class="[^"]*\bghost\b[^"]*"/.test(tag))
    .map((tag) => tag.match(/id="([^"]+)"/)?.[1]);
  assert.deepEqual(ghostIds, [
    "help-btn-top", "odds-btn-top", "new-match-top",
    "pass-btn", "hint-btn", "sort-btn", "clear-btn",
    "help-btn-start",
  ]);
  const { css, rules } = task025Rules();
  // The gold family is derived from the trim: --gold is still the
  // hand zone's turn border, and the deeper shades share its hue
  // and saturation, stepping down in lightness.
  const token = (name: string): string => {
    const m = css.match(new RegExp(`--${name}:(#[0-9a-f]{6});`));
    assert.ok(m, `--${name} token ships`);
    return m[1];
  };
  const gold = token("gold");
  const deep = token("gold-deep");
  const ledge = token("gold-ledge");
  const ink = token("gold-ink");
  assert.equal(gold, "#ffb223", "the trim gold itself is unchanged");
  const trim = rules.filter((r) => r.selector === ".handzone.myturn");
  assert.ok(trim.some((r) => /border-color:var\(--gold\);/.test(r.body)), "the trim is --gold");
  const g = task025Hsl(gold);
  for (const shade of [deep, ledge]) {
    const s = task025Hsl(shade);
    assert.ok(Math.abs(s.h - g.h) < 1.5, `${shade} keeps the trim's hue`);
    assert.ok(s.s > 0.98, `${shade} keeps the trim's full saturation`);
  }
  assert.ok(g.l > task025Hsl(deep).l && task025Hsl(deep).l > task025Hsl(ledge).l, "gold > deep > ledge in lightness");
  // Text stays clearly legible: WCAG AA (4.5:1) on the face and on
  // the hover/pressed shade; white would not be (1.8:1).
  assert.ok(task025Contrast(ink, gold) >= 4.5, "ink on gold meets AA");
  assert.ok(task025Contrast(ink, deep) >= 4.5, "ink on deep gold meets AA");
  assert.ok(task025Contrast("#ffffff", gold) < 3, "white on gold would not be legible");
  // The rules: gold face + dark ink + gold ledge; deeper gold on
  // hover and pressed. The old slate is gone from the stylesheet.
  const ghost = rules.find((r) => r.selector === "button.ghost:not(#pass-btn)")!;
  assert.ok(ghost, "button.ghost rule exists");
  assert.match(ghost.body, /background:var\(--gold\);/);
  assert.match(ghost.body, /color:var\(--gold-ink\);/);
  assert.match(ghost.body, /box-shadow:0 5px 0 var\(--gold-ledge\), 0 8px 16px rgba\(0,0,0,\.3\)/);
  const hover = rules.find((r) => r.selector === "button.ghost:not(#pass-btn):hover")!;
  assert.ok(hover, "button.ghost:hover rule exists");
  assert.match(hover.body, /background:var\(--gold-deep\);/);
  const active = rules.find((r) => r.selector === "button.ghost:not(#pass-btn):active")!;
  assert.ok(active, "button.ghost:active rule exists");
  assert.match(active.body, /background:var\(--gold-deep\);/);
  assert.match(active.body, /box-shadow:0 1px 0 var\(--gold-ledge\), 0 3px 8px rgba\(0,0,0,\.3\);/);
  assert.ok(!/#486a73|#33525b/i.test(css), "the slate face and ledge are gone");
  // The Sort toggle's id rule no longer forces white over the gold:
  // word and arrow both carry the dark ink.
  const sort = rules.find((r) => r.selector === "#sort-btn")!;
  assert.ok(sort, "#sort-btn rule exists");
  assert.match(sort.body, /color:var\(--gold-ink\);/);
  const arrow = rules.find((r) => r.selector === "#sort-btn .sort-arrow")!;
  assert.ok(arrow, "#sort-btn .sort-arrow rule exists");
  assert.match(arrow.body, /color:inherit;margin-left:5px;font-weight:900;/);
  assert.ok(!rules.some((r) => r.selector.includes("ghost") && /color:#fff/.test(r.body)), "no white text on gold");
});

test("utility buttons: genuine disabled states stay grey; primaries keep their colors (TASK 025)", () => {
  const { rules } = task025Rules();
  // PASS and HINT really are disabled off-turn (renderControls).
  // HINT takes the grey below; PASS keeps its own red (next block).
  const src = readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8");
  assert.match(src, /els\.passBtn\.disabled = !myTurn;/);
  assert.match(src, /els\.hintBtn\.disabled = !myTurn;/);
  // The shared disabled wash is untouched...
  const base = rules.find((r) => r.selector === "button:disabled")!;
  assert.ok(base, "button:disabled rule exists");
  assert.equal(base.body, "opacity:.4;cursor:not-allowed;transform:none;filter:grayscale(.4);");
  // ...and a disabled gold button drops to a fully desaturated grey
  // face, ledge, and ink — declared after hover/pressed so neither
  // can repaint it gold.
  const idx = (selector: string): number => rules.findIndex((r) => r.selector === selector);
  const disabled = rules[idx("button.ghost:not(#pass-btn):disabled")];
  assert.ok(disabled, "button.ghost:disabled rule exists");
  assert.ok(idx("button.ghost:not(#pass-btn):disabled") > idx("button.ghost:not(#pass-btn):hover"));
  assert.ok(idx("button.ghost:not(#pass-btn):disabled") > idx("button.ghost:not(#pass-btn):active"));
  assert.match(disabled.body, /filter:grayscale\(1\);/);
  assert.ok(!/var\(--gold/.test(disabled.body), "no gold in the disabled state");
  const colors = [...disabled.body.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0]);
  assert.equal(colors.length, 3, "face, ink, ledge");
  for (const c of colors) {
    const chroma = Math.max(...task025Rgb(c)) - Math.min(...task025Rgb(c));
    assert.ok(chroma < 0.06, `${c} is a desaturated grey`);
  }
  const face = disabled.body.match(/background:(#[0-9a-f]{6});/)?.[1];
  const ledgeShadow = disabled.body.match(/box-shadow:0 5px 0 (#[0-9a-f]{6}),/)?.[1];
  assert.ok(face && ledgeShadow);
  assert.ok(task025Hsl(ledgeShadow).l < task025Hsl(face).l, "the grey keeps its 3D ledge");
  // Buttons with their own colors keep them. PASS is a .ghost in
  // the markup but has always been red via its id rule: every gold
  // rule skips it, and its red face, ledge, and pressed ledge are
  // unchanged (so its text, hover, and disabled look are the base
  // button's white / brightness / grey wash, exactly as before).
  const ghostRules = rules.filter((r) => /\bbutton\.ghost\b/.test(r.selector));
  assert.equal(ghostRules.length, 4);
  for (const r of ghostRules) assert.ok(r.selector.startsWith("button.ghost:not(#pass-btn)"), `${r.selector} skips PASS`);
  const pass = rules.find((r) => r.selector === "#pass-btn")!;
  assert.equal(pass.body, "background:var(--red);box-shadow:0 5px 0 var(--red-dark), 0 8px 16px rgba(0,0,0,.3), inset 0 2px 0 rgba(255,255,255,.35);");
  const passActive = rules.find((r) => r.selector === "#pass-btn:active")!;
  assert.equal(passActive.body, "box-shadow:0 1px 0 var(--red-dark), 0 3px 8px rgba(0,0,0,.3);");
  assert.ok(!rules.some((r) => r.selector.startsWith("#pass-btn") && /color:|filter:/.test(r.body)), "PASS text and filters come from the base button");
  // Play cards stays green, the start/dialog primaries stay the
  // base blue.
  const play = rules.find((r) => r.selector === "#play-btn")!;
  assert.match(play.body, /background:var\(--green\);box-shadow:0 5px 0 var\(--green-dark\)/);
  const button = rules.find((r) => r.selector === "button")!;
  assert.match(button.body, /background:var\(--blue\);color:#fff;/);
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  for (const id of ["play-btn", "start-btn", "continue-btn", "new-match-btn"]) {
    const tag = html.match(new RegExp(`<button\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `#${id} ships`);
    assert.ok(!/\bghost\b/.test(tag), `#${id} is not a ghost button`);
  }
});

test("e2e: round-over banner — subline, PLACE/PLAYER/TOTAL/ROUND columns, medals, attached penalty rows (TASK 032)", async () => {
  await import("../src/main.js");
  const SEATS = ["You", "Mina", "Kenji", "Rosa"];
  const hasClass = (node: FakeElement, cls: string): boolean =>
    (node.className ?? "").split(/\s+/).includes(cls);
  const findDeep = (node: FakeElement, pred: (n: FakeElement) => boolean): FakeElement | undefined => {
    if (pred(node)) return node;
    for (const child of node.children) {
      const hit = findDeep(child, pred);
      if (hit) return hit;
    }
    return undefined;
  };
  // Play from wherever the game is until a round/match banner.
  const driveToBanner = (): void => {
    for (let steps = 0; steps < 20000; steps++) {
      const phase = settle();
      if (phase === "banner") return;
      humanMove();
    }
    throw new Error("never reached a banner");
  };
  const dataRows = (): FakeElement[] => {
    const table = $("banner-body").children.find((c) => c.tagName === "TABLE");
    assert.ok(table, "the banner has a table");
    return table.children.filter((c) => c.tagName === "TR");
  };
  const checkBanner = (round: number): { totals: number[] } => {
    const body = $("banner-body");
    // Subline: first child, naming the round just finished.
    const sub = body.children[0];
    assert.equal(sub.className, "roundsub");
    assert.equal(sub.textContent, `ROUND ${round} · FIRST TO 13`);
    // Header row: PLACE | PLAYER | TOTAL | ROUND (th text is
    // title-case in the DOM; the shipped CSS uppercases it).
    const table = body.children.find((c) => c.tagName === "TABLE");
    assert.ok(table && hasClass(table, "sumtable"), "the summary table carries .sumtable");
    const thead = table.children.find((c) => c.tagName === "THEAD");
    assert.ok(thead, "the table has a header");
    assert.deepEqual(
      thead.children[0].children.map((c) => c.textContent),
      ["Place", "Player", "Total", "Round"],
    );
    const rows = dataRows();
    assert.equal(rows.length, 4, "one row per finisher");
    const totals: number[] = [];
    rows.forEach((tr, placeIdx) => {
      const [placeCell, nameCell, totalCell, deltaCell] = tr.children;
      const name = nameCell.textContent;
      const seat = SEATS.indexOf(name);
      assert.ok(seat >= 0, `row ${placeIdx} names a seat (got ${name})`);
      if (placeIdx === 0 || placeIdx === 1) {
        const medal = placeCell.children[0];
        assert.ok(medal, `${name}: medal present in the PLACE cell`);
        assert.equal(medal.className, placeIdx === 0 ? "medal gold" : "medal silver");
        assert.equal(medal.textContent, `${placeIdx + 1}`);
        assert.equal(medal.getAttribute("aria-label"), `Finished ${placeIdx === 0 ? "1st" : "2nd"}`);
        assert.equal(medal.getAttribute("role"), "img");
      } else {
        assert.equal(placeCell.textContent, placeIdx === 2 ? "3rd" : "4th");
        assert.equal(
          findDeep(placeCell, (n) => hasClass(n, "medal")), undefined,
          `${name}: no medal below 2nd`,
        );
      }
      // TOTAL: the seat's match total with the muted /13 suffix,
      // matching the scoreboard exactly.
      const [numSpan, suffixSpan] = totalCell.children;
      assert.equal(Number(numSpan.textContent), scoreValues()[seat], `${name}: total matches the scoreboard`);
      assert.equal(suffixSpan.textContent, " /13");
      assert.ok(hasClass(suffixSpan, "tsuffix"));
      totals.push(Number(numSpan.textContent));
      // ROUND: the signed gain, colored by sign.
      assert.match(deltaCell.textContent, /^[+-]?\d+$/);
      const delta = Number(deltaCell.textContent);
      if (delta > 0) assert.ok(hasClass(deltaCell, "pos"), `${name}: positive gain is .pos`);
      if (delta < 0) assert.ok(hasClass(deltaCell, "neg"), `${name}: negative gain is .neg`);
    });
    return { totals };
  };

  $("new-match-top").click();
  driveToBanner();
  const afterRound1 = checkBanner(1);
  // Round 1: totals equal the gains by construction; the pinned
  // distinction arrives at the round-2 banner.
  $("continue-btn").click();
  driveToBanner();
  const afterRound2 = checkBanner(2);
  const rows2 = dataRows();
  const anyDifferent = rows2.some((tr) => {
    const total = Number(tr.children[2].children[0].textContent);
    const delta = Number(tr.children[3].textContent);
    return total !== delta;
  });
  assert.ok(anyDifferent, "by round 2 the TOTAL column is visibly not the ROUND column");
  assert.equal(afterRound2.totals.reduce((a, b) => a + b, 0), afterRound1.totals.reduce((a, b) => a + b, 0), "totals stay zero-sum across rounds");

  // Penalty rows: play on until a banner carries one. The hunt
  // drives the human PASSIVELY (pass whenever legal) — a passive
  // player finishes holding cards, which is exactly how leftover
  // 2s and unused bombs (the penalty causes) happen; hint-driven
  // play sheds them and can go many rounds without one.
  const passiveMove = (): void => {
    // Pass only when facing a play: the leader's pass button is
    // enabled but rejected, which would loop forever.
    if (!$("pass-btn").disabled && $("to-beat").textContent.includes("To beat")) {
      $("pass-btn").click();
      return;
    }
    humanMove();
  };
  const driveToBannerPassive = (): void => {
    for (let steps = 0; steps < 20000; steps++) {
      const phase = settle();
      if (phase === "banner") return;
      passiveMove();
    }
    throw new Error("never reached a banner (passive)");
  };
  let attached = false;
  for (let round = 3; round <= 14 && !attached; round++) {
    if (isMatchEndBanner()) break;
    $("continue-btn").click();
    driveToBannerPassive();
    const table = $("banner-body").children.find((c) => c.tagName === "TABLE");
    assert.ok(table);
    const kids = table.children;
    for (let i = 0; i < kids.length; i++) {
      if (!hasClass(kids[i], "penrowtr")) continue;
      const cell = kids[i].children[0];
      assert.equal(cell.getAttribute("colspan"), "4", "the note spans the table");
      const note = cell.children[0];
      assert.ok(hasClass(note, "penrow"), "the note keeps the penrow styling/animation hook");
      const payer = /^Penalty: (\w+) pays? /.exec(note.textContent)?.[1];
      assert.ok(payer, `note names its payer: ${note.textContent}`);
      const above = kids[i - 1];
      assert.ok(above && above.tagName === "TR" && !hasClass(above, "penrowtr"), "the note row follows a player row");
      assert.equal(above.children[1].textContent, payer, "the note sits under its payer's row");
      attached = true;
    }
  }
  assert.ok(attached, "a penalty note row appeared and was verified attached under its payer");
});

// ---------- TASK 033: instant-win celebration beat ----------

test("e2e: instant-win celebration beat — withheld banner, skip, no replay, timed handoff (TASK 033)", async () => {
  await import("../src/main.js");
  const hasCls = (node: FakeElement, cls: string): boolean =>
    (node.className ?? "").split(/\s+/).includes(cls);
  const findBeat = (): FakeElement | null => {
    const walk = (node: FakeElement): FakeElement | null => {
      if (hasCls(node, "iwbeat")) return node;
      for (const child of node.children) {
        const hit = walk(child);
        if (hit) return hit;
      }
      return null;
    };
    return walk(fakeDocument.body);
  };
  // A seed whose FIRST deal hands some seat an instant win, found
  // with the engine itself so the scripted deal is exact.
  let scripted: { seed: number; winner: number; kind: string } | null = null;
  for (let seed = 1; seed < 5000 && !scripted; seed++) {
    const hands = newDeal(seededRng(seed));
    for (let p = 0; p < 4; p++) {
      const win = detectInstantWin(hands[p]);
      if (win) {
        scripted = { seed, winner: p, kind: win.kind };
        break;
      }
    }
  }
  assert.ok(scripted, "a seed with an instant-win first deal exists");
  const { seed, winner, kind } = scripted;
  const kindWords = kind.replaceAll("-", " ");

  // --- the beat: banner withheld, content pinned ---
  pumpTimers();
  Math.random = seededRng(seed);
  $("new-match-top").click();
  const beat = findBeat();
  assert.ok(beat, "the beat overlay was created");
  assert.equal(beat.hidden, false, "the beat is showing");
  assert.equal($("banner").hidden, true, "the banner is withheld during the beat");
  const card = beat.children[0];
  assert.ok(hasCls(card, "iwbeat-card"), "the beat card is the overlay's child");
  assert.equal(card.children[0].textContent, "INSTANT WIN!", "the headline");
  assert.equal(
    card.children[1].textContent,
    `${SEAT_NAMES[winner]} — ${kindWords}`,
    "the winner line uses the banner note's kind wording",
  );
  assert.equal(timerQueue.length, 1, "exactly one timer pending: the beat's handoff");

  // --- a re-render of the same summary must not replay it ---
  $("clear-btn").click();
  assert.equal(findBeat(), beat, "the overlay is not rebuilt by a re-render");
  assert.equal(beat.hidden, false, "the beat is still showing after a re-render");
  assert.equal($("banner").hidden, true, "the banner is still withheld");
  assert.equal(timerQueue.length, 1, "no second beat timer was armed");

  // --- skip: a tap hands off at once ---
  beat.click();
  assert.equal(beat.hidden, true, "the skip hides the beat");
  assert.equal($("banner").hidden, false, "the banner lands immediately on skip");
  assert.equal($("banner-title").textContent, "Instant win!");
  // (The modal's .instantwin class lives on the banner's child in
  // the shipped HTML — this harness's flat id registry has no such
  // child to read; the class toggle is pinned by the CSS rules
  // below and exercised by the browser probe.)
  const note = $("banner-body").children.find((c) => c.tagName === "P");
  assert.equal(
    note?.textContent,
    `${SEAT_NAMES[winner]} was dealt an instant-win hand (${kindWords}). Everyone else pays 2.`,
    "the banner note is unchanged",
  );
  const table = $("banner-body").children.find((c) => c.tagName === "TABLE");
  assert.ok(table, "the banner table is present");
  const winRows = table.children.filter((tr) => hasCls(tr, "winline"));
  assert.equal(winRows.length, 1, "exactly the winner's row pulses");
  assert.ok(
    winRows[0].textContent.includes(SEAT_NAMES[winner]),
    "the pulsing row is the winner's",
  );
  // The skipped beat's timer is still in the fake queue (the fake
  // setTimeout has no clearTimeout counterpart); firing it must be
  // a no-op, not a second handoff.
  pumpTimers();
  assert.equal($("banner").hidden, false, "a stale beat timer does not disturb the banner");
  assert.equal(beat.hidden, true, "the beat stays settled");

  // --- the timed handoff: a fresh instant win, left to run ---
  Math.random = seededRng(seed);
  $("new-match-top").click();
  assert.equal(findBeat(), beat, "the same overlay element is reused");
  assert.equal(beat.hidden, false, "a new instant-win summary plays the beat again");
  assert.equal($("banner").hidden, true, "the banner is withheld again");
  pumpTimers(); // fires the beat's handoff timer
  assert.equal(beat.hidden, true, "the beat ends at the handoff");
  assert.equal($("banner").hidden, false, "the banner follows the beat");
  assert.equal($("banner-title").textContent, "Instant win!");

  // --- non-instant rounds are untouched ---
  // A plain deal: no beat at deal time, and the round-over banner
  // lands with the overlay hidden throughout. (This harness's
  // timers are a FIFO queue, so a wrongly-armed beat timer would
  // be pumped through inside settle() — the transient check is
  // the browser probe in the task's proof bar; here the end state
  // and the deal-time state are pinned.)
  let plainSeed = 0;
  for (let s = 1; s < 5000; s++) {
    if (newDeal(seededRng(s)).every((h) => !detectInstantWin(h))) {
      plainSeed = s;
      break;
    }
  }
  assert.ok(plainSeed > 0, "a seed with a plain first deal exists");
  Math.random = seededRng(plainSeed);
  $("new-match-top").click();
  assert.equal(beat.hidden, true, "no beat for a plain deal");
  driveToRoundBanner031();
  assert.equal($("banner-title").textContent, "Round over", "a plain round-over banner");
  assert.equal(beat.hidden, true, "the beat never showed for the plain round");

  // --- shipped style pins ---
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const cardRule = rules.find((r) => r.selector === ".iwbeat-card")!;
  assert.ok(cardRule, ".iwbeat-card rule exists");
  assert.match(cardRule.body, /position:absolute/);
  assert.match(cardRule.body, /animation:stampIn \.45s cubic-bezier\(\.2,1\.4,\.4,1\) both/);
  const beatBurst = rules.find((r) => r.selector === ".iwbeat-card::before")!;
  assert.ok(beatBurst, "the beat burst rule exists");
  assert.match(beatBurst.body, /inset:-70px/);
  assert.match(beatBurst.body, /animation:burst 2\.6s ease-out both/);
  const winRow = rules.find((r) => r.selector === "tr.winline")!;
  assert.ok(winRow, "tr.winline rule exists");
  assert.match(winRow.body, /animation:winPulse \.8s ease-in-out 4 both/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.iwbeat-card[^{}]*\{animation:none !important;/,
    "reduced motion stills the beat (text shows statically, timer still hands off)",
  );
  // (TASK 036: the beat moved from src/main.ts to src/dom/banner.ts.)
  const bannerTs = readFileSync(new URL("../../src/dom/banner.ts", import.meta.url), "utf8");
  assert.match(bannerTs, /const BEAT_MS = 2800;/, "the beat's total duration is ~2.8s");
});
