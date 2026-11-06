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
  key?: string;
}

type FakeListener = (ev: FakeEvent) => void;

class FakeElement {
  tagName: string;
  nodeType = 1;
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
  // TASK 037: the phone menu's outside-click test and Escape focus
  // return. contains() walks the parent chain the fake tracks.
  contains(node: FakeElement | null): boolean {
    for (let at = node; at; at = at.parent) if (at === this) return true;
    return false;
  }
  focus(): void {
    fakeDocument.activeElement = this;
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
  override nodeType = 3;
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
  "menu-btn", "menu-panel",
  "app", "confirm-overlay", "confirm-standing", "confirm-cancel", "confirm-new",
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
  // TASK 037: document-level listeners (the phone menu closes on an
  // outside click and on Escape) and the focused element.
  listeners: {} as Record<string, FakeListener[]>,
  addEventListener(type: string, fn: FakeListener): void {
    (this.listeners[type] ??= []).push(fn);
  },
  activeElement: null as FakeElement | null,
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

// A match can end on a normal round ("… wins the match!" — "You
// win the match!" for the human seat since TASK 041) or on an
// instant-win round ("Match over!") — both are match ends.
function isMatchEndBanner(): boolean {
  const title = $("banner-title").textContent;
  return /(?:wins|You win) the match/.test(title) || title === "Match over!";
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
  // TASK 041: rejections now show player copy ("Beat … — or Pass.",
  // "Those cards don't make a set…") in the error style; the old
  // engine phrases stay in the list for the unmapped fallback.
  assert.ok(
    !/Select at least|not in your hand|does not beat|must include|not a valid|^Beat |don't make a set|can't lead|can't pass|brings you back/i.test(message),
    `hint-driven move was rejected: ${message}`,
  );
  assert.ok(!$("message")._classes.has("error"), `hint-driven move was rejected: ${message}`);
}

// New match from the header (TASK 040): with a match in progress
// the button asks first; this confirms. With nothing to lose (no
// match yet, or the match decided) it is one tap and no dialog opens.
function newMatchTop(): void {
  $("new-match-top").click();
  if (!$("confirm-overlay").hidden) $("confirm-new").click();
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
      if (/(?:wins|You win) the match/.test($("banner-title").textContent)) {
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
  newMatchTop();
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

  newMatchTop();
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
  newMatchTop();
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
  newMatchTop();
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
    newMatchTop();
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
    newMatchTop();
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
    newMatchTop();
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
  newMatchTop();
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
  newMatchTop();
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

test("e2e: score persistence — Resume restores points and round; scoring accumulates on top (TASK 031/039)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  $("resume-btn").click();
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

test("e2e: score persistence — New Match clears the save; match end clears it (TASK 031/039)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  $("resume-btn").click();
  settle();
  assert.ok(fakeStorage.map.has(SCORE_KEY), "save present mid-match");
  newMatchTop();
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
  const main = await import("../src/main.js");
  const idle: ControllerState = {
    phase: "idle", match: null, trick: null, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null, roundId: 0, trickId: 0,
  };
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
    // TASK 039: Start clears the save unconditionally, so it never
    // reaches the parser — each bad payload is judged through the
    // two paths that DO parse it. First the start gate (what a
    // reload shows): the parser rejects the payload, so the gate
    // offers no Resume, the start button keeps its no-save label,
    // and the bad save is removed from storage.
    fakeStorage.setItem(SCORE_KEY, payload);
    main.render(idle);
    assert.equal($("resume-btn").hidden, true, `gate offers no Resume: ${payload}`);
    assert.equal($("start-btn").textContent, "Start Game", `gate reads Start Game: ${payload}`);
    assert.equal(fakeStorage.map.has(SCORE_KEY), false, `gate removed the bad save: ${payload}`);
    // Then the Resume click itself, with the payload back in
    // storage: the parser rejects it again and the match starts
    // fresh rather than restoring it.
    fakeStorage.setItem(SCORE_KEY, payload);
    $("resume-btn").click();
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
  main.render(idle);
  assert.equal($("resume-btn").hidden, false, "band edges: the gate offers Resume");
  assert.equal($("start-btn").textContent, "New Match", "band edges: the gate reads New Match");
  $("resume-btn").click();
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

test("e2e: start screen — Resume offered iff a save exists, labeled with round + scores; New Match starts fresh (TASK 039)", async () => {
  const main = await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  const idle: ControllerState = {
    phase: "idle", match: null, trick: null, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null, roundId: 0, trickId: 0,
  };
  // No save: the gate is exactly as it always was — no Resume
  // control, and the start button keeps its original label.
  main.render(idle);
  assert.equal($("resume-btn").hidden, true, "no save, no Resume control");
  assert.equal($("start-btn").textContent, "Start Game");
  // A save: Resume appears, labeled with the saved round and
  // standings, and the start button becomes New Match.
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  main.render(idle);
  assert.equal($("resume-btn").hidden, false, "a save offers Resume");
  assert.equal(
    $("resume-btn").textContent,
    "Resume — Round 4 · You 5 · Mina -2 · Kenji 3 · Rosa 0",
    "the Resume label carries the saved round and every seat's score",
  );
  assert.equal($("start-btn").textContent, "New Match");
  // Choosing New Match at the gate: a fresh 0-0 round 1, and the
  // save is gone.
  $("start-btn").click();
  settle();
  assert.deepEqual(scoreValues(), [0, 0, 0, 0], "New Match starts at 0-0");
  assert.equal($("round-num").textContent, "1", "New Match starts at round 1");
  assert.equal(fakeStorage.map.has(SCORE_KEY), false, "New Match at the gate clears the save");
});

test("e2e: score persistence — the save never moves mid-round; it changes only when a round lands (TASK 039)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  fakeStorage.throws = false;
  newMatchTop();
  settle();
  driveToRoundBanner031();
  const landed = fakeStorage.map.get(SCORE_KEY);
  assert.ok(landed, "the round-end save exists at the banner");
  $("continue-btn").click();
  // Play the whole next round one move at a time: whatever the
  // board does mid-round — bomb penalties moving points included
  // — the stored save must stay byte-identical until the round
  // lands, then hold the landed board and the advanced round.
  for (let steps = 0; steps < 20000; steps++) {
    const phase = settle();
    if (phase === "banner") {
      assert.ok(!isMatchEndBanner(), "round two of a fresh match cannot end the match");
      const next = JSON.parse(fakeStorage.map.get(SCORE_KEY)!) as { scores: number[]; round: number };
      assert.deepEqual(next.scores, scoreValues(), "the new save holds the landed board");
      assert.equal(next.round, 3, "the save advanced to the next round");
      return;
    }
    assert.equal(
      fakeStorage.map.get(SCORE_KEY), landed,
      "the save did not move mid-round",
    );
    humanMove();
  }
  throw new Error("never reached the next round banner");
});

test("e2e: finish medals — 1st gold, 2nd silver, 3rd/4th keep the green pill (TASK 029)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  // Play a full round: at the round banner every seat has a
  // finish place.
  newMatchTop();
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
  // Inventory, pinned on the shipped markup: ten button.ghost
  // elements — the header's .ghost.small set (TASK 037 adds the
  // phone ☰ Menu button ahead of the trio it holds), the controls
  // row, the start screen's How to play, and (TASK 041) How to
  // play's own top close control.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const ghostIds = [...html.matchAll(/<button\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /class="[^"]*\bghost\b[^"]*"/.test(tag))
    .map((tag) => tag.match(/id="([^"]+)"/)?.[1]);
  assert.deepEqual(ghostIds, [
    "menu-btn", "help-btn-top", "odds-btn-top", "new-match-top",
    "pass-btn", "hint-btn", "sort-btn", "clear-btn",
    "help-btn-start", "help-close-top",
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

  newMatchTop();
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
  newMatchTop();
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
    `${SEAT_NAMES[winner]} ${winner === 0 ? "were" : "was"} dealt an instant-win hand (${kindWords}). Everyone else pays 2.`,
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
  newMatchTop();
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
  newMatchTop();
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

// ---------- TASK 037: phone one-screen layout (V3) ----------

test("e2e: phone menu — the ☰ panel holds the three header buttons themselves; item, outside tap and Escape close it (TASK 037)", async () => {
  // Markup: one ☰ Menu button (a disclosure, closed at rest) and a
  // panel holding exactly How to play / Bomb odds / New match — the
  // same three header buttons, moved, never duplicated.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const header = html.slice(html.indexOf('<header class="top">'), html.indexOf("</header>"));
  assert.match(
    header,
    /<button class="ghost small" id="menu-btn" type="button" aria-expanded="false" aria-controls="menu-panel"><span aria-hidden="true">☰<\/span> Menu<\/button>/,
  );
  const panel = header.match(/<div class="menu-panel" id="menu-panel">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.deepEqual(
    [...panel.matchAll(/<button\b[^>]*id="([^"]+)"/g)].map((m) => m[1]),
    ["help-btn-top", "odds-btn-top", "new-match-top"],
  );
  for (const id of ["menu-btn", "menu-panel", "help-btn-top", "odds-btn-top", "new-match-top"]) {
    assert.equal(html.split(`id="${id}"`).length, 2, `#${id} appears exactly once`);
  }

  await import("../src/main.js");
  // The fake has no markup parser: mirror the panel's children so
  // a click can bubble the way it does in the page (item -> panel ->
  // document).
  for (const id of ["help-btn-top", "odds-btn-top", "new-match-top"]) $("menu-panel").appendChild($(id));
  const docFire = (type: string, ev: FakeEvent): void => {
    for (const fn of fakeDocument.listeners[type] ?? []) fn(ev);
  };
  const tap = (node: FakeElement): void => {
    const ev = { target: node };
    for (let at: FakeElement | null = node; at; at = at.parent) {
      for (const fn of at.listeners.click ?? []) fn(ev);
    }
    docFire("click", ev);
  };
  const expanded = (): string | null => $("menu-btn").getAttribute("aria-expanded");
  // Same handlers, not copies: each item carries exactly the one
  // click handler the header button always had.
  for (const id of ["help-btn-top", "odds-btn-top", "new-match-top"]) {
    assert.equal($(id).listeners.click?.length, 1, `#${id} has its single original handler`);
  }

  // Fresh match, mid-round, at the human's turn. (TASK 040: an
  // earlier test may have left a match in progress — then the tap
  // asks first, and this confirms.)
  tap($("new-match-top"));
  if (!$("confirm-overlay").hidden) $("confirm-new").click();
  settleToYourTurn();
  humanMove();
  settleToYourTurn();
  const midGame = pageSnapshot();
  assert.ok(handCount() < 13, "the human has played");

  // ☰ toggles; How to play opens and the menu closes behind it.
  tap($("menu-btn"));
  assert.equal(expanded(), "true");
  tap($("menu-btn"));
  assert.equal(expanded(), "false", "a second tap closes");
  tap($("menu-btn"));
  tap($("help-btn-top"));
  assert.equal($("help-overlay").hidden, false, "How to play opens from the menu");
  assert.equal(expanded(), "false", "the menu closes after an item");
  $("help-close").click();
  // Bomb odds, the same way.
  tap($("menu-btn"));
  tap($("odds-btn-top"));
  assert.equal($("odds-overlay").hidden, false, "Bomb odds opens from the menu");
  assert.equal(expanded(), "false");
  $("odds-close").click();
  // An outside tap closes; a tap inside the panel's own box does not
  // count as outside.
  tap($("menu-btn"));
  docFire("click", { target: $("menu-panel") });
  assert.equal(expanded(), "true", "a tap on the panel itself is inside");
  tap($("hand"));
  assert.equal(expanded(), "false", "an outside tap closes");
  // Escape closes and returns focus to the ☰ button; other keys and
  // a closed menu are left alone.
  tap($("menu-btn"));
  docFire("keydown", { key: "Enter" });
  assert.equal(expanded(), "true");
  docFire("keydown", { key: "Escape" });
  assert.equal(expanded(), "false");
  assert.equal(fakeDocument.activeElement, $("menu-btn"));
  fakeDocument.activeElement = null;
  docFire("keydown", { key: "Escape" });
  assert.equal(fakeDocument.activeElement, null, "Escape on a closed menu does nothing");
  // The menu is presentation: the game is exactly where it was.
  const now = pageSnapshot();
  delete now.dom["menu-btn"];
  delete midGame.dom["menu-btn"];
  assert.deepEqual(now, midGame, "menu use leaves the game untouched");

  // New match from the menu starts a fresh match: play the round out
  // so the board has moved, continue, then New match.
  driveToRoundBanner031();
  $("continue-btn").click();
  settle();
  assert.equal($("round-num").textContent, "2");
  assert.notDeepEqual(scoreValues(), [0, 0, 0, 0], "points moved in round 1");
  tap($("menu-btn"));
  tap($("new-match-top"));
  assert.equal(expanded(), "false");
  // TASK 040: mid-match, the menu item asks first — nothing has
  // moved yet; confirming wipes the match.
  assert.equal($("confirm-overlay").hidden, false, "the menu's New match asks first mid-match");
  assert.equal($("round-num").textContent, "2", "nothing reset before confirming");
  tap($("confirm-new"));
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal($("round-num").textContent, "1", "back to round 1");
  assert.deepEqual(scoreValues(), [0, 0, 0, 0], "scores reset");
  settle();
  assert.equal($("banner").hidden, true);
});

test("e2e: score strip data — the live count line is number + unit, same text (TASK 037)", async () => {
  const { render } = await import("../src/main.js");
  const metaOf = (box: FakeElement): FakeElement =>
    box.children.find((c) => (c.className ?? "").split(/\s+/).includes("meta"))!;
  // Not dealt: the whole line, no live split (the strip hides it).
  render({ phase: "idle", match: null, trick: null, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null, ...freshIds() });
  for (const box of $("scores").children) {
    const meta = metaOf(box);
    assert.equal(meta.className, "meta");
    assert.equal(meta.textContent, "Not dealt yet");
  }
  // In play: <span class="n">count</span><span class="u"> cards left</span>
  // — the desktop line reads exactly as before.
  const hands = [
    [makeCard("3", "spades"), makeCard("9", "clubs")],
    [makeCard("5", "hearts"), makeCard("6", "hearts"), makeCard("7", "clubs")],
    [makeCard("7", "hearts")],
    [makeCard("8", "hearts"), makeCard("8", "clubs")],
  ];
  const trick = createTrickState(hands, { leader: 0, openingLead: true });
  render({ phase: "playing", match: createMatch(), trick, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null, ...freshIds() });
  const counts = [2, 3, 1, 2];
  $("scores").children.forEach((box, p) => {
    const meta = metaOf(box);
    assert.equal(meta.className, "meta live");
    assert.equal(meta.textContent, `${counts[p]} cards left`);
    assert.deepEqual(meta.children.map((c) => [c.className, c.textContent]), [
      ["n", `${counts[p]}`],
      ["u", " cards left"],
    ]);
  });
});

test("css: phone layout V3 lives in a <=520px block; desktop and the 521-640 band are untouched (TASK 037)", () => {
  const raw = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const at640 = css.indexOf("@media (max-width:640px){");
  const at520 = css.indexOf("@media (max-width:520px){");
  assert.ok(at640 >= 0 && at520 > at640, "the 520 block layers after the 640 block");
  assert.equal(css.split("@media (max-width:520px){").length, 2, "one phone-layout block");
  const end520 = css.indexOf("\n}", at520);
  const block = css.slice(at520, end520);
  const outside = css.slice(0, at520) + css.slice(end520);
  const rulesIn = (text: string): { selector: string; body: string }[] =>
    [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1].replace(/^[\s\S]*\{/, "").trim(),
      body: m[2].trim(),
    }));
  const phone = rulesIn(block.slice(block.indexOf("{") + 1));
  const ruleOf = (selector: string): string => {
    const r = phone.find((x) => x.selector === selector);
    assert.ok(r, `${selector} rule in the phone block`);
    return r.body;
  };
  // Above the breakpoint the ☰ button is not rendered and the panel
  // is layout-transparent: the header renders as before.
  assert.ok(outside.includes("#menu-btn{display:none;}"));
  assert.ok(outside.includes(".menu-panel{display:contents;}"));
  assert.equal(ruleOf("#menu-btn"), "display:inline-block;");
  assert.equal(ruleOf(".menu-panel"), "display:none;");
  assert.match(ruleOf('#menu-btn[aria-expanded="true"] + .menu-panel'), /display:flex;/);
  assert.match(ruleOf(".menu-panel button"), /min-height:44px;/);
  // Slim header: subtitle and the First-to-13 chip are not shown.
  assert.equal(ruleOf("h1 .sub"), "display:none;");
  assert.equal(ruleOf(".chip.gold"), "display:none;");
  // The strip: one row of four content-sized cells (never wraps),
  // no progress bar.
  assert.match(ruleOf(".scores"), /display:flex;/);
  assert.ok(!/flex-wrap:wrap/.test(ruleOf(".scores")), "the strip is one row");
  assert.match(ruleOf(".score"), /white-space:nowrap;/);
  assert.equal(ruleOf(".score .bar"), "display:none;");
  // John's closer trade: no Before-that line on the phone — and
  // only there.
  assert.equal(ruleOf(".pile .prior"), "display:none;");
  assert.ok(!/\.prior\{display:none/.test(outside), "desktop keeps the Before-that line");
  // Fit ruling A (John, 2026-11-04): the phone block DOES size the
  // pile — 144px, Task 015's formula without the dropped
  // Before-that line — overriding the 640 block's 207px here only.
  assert.equal(ruleOf(".pile"), "height:144px;");
  // Hand cards ~42px; action buttons keep >=44px tall targets.
  assert.equal(ruleOf(".hand .card"), "width:42px;height:60px;");
  assert.match(ruleOf(".controls button"), /min-height:44px;/);
  // Fit ruling B (same ruling): the action row fits on one line —
  // 12.5px type, 6px side padding, 4px gaps.
  assert.equal(ruleOf(".controls"), "margin-top:6px;gap:4px;");
  assert.equal(
    ruleOf(".controls button"),
    "min-height:44px;padding:6px 6px;font-size:12.5px;letter-spacing:.2px;",
  );
  // Locked designs are not restyled here: no rule touches PLAY /
  // PASS / the ghost family / the turn panel / the felt's paint, and
  // nothing animates.
  for (const r of phone) {
    assert.ok(!/#play-btn|#pass-btn|\.ghost|\.myturn/.test(r.selector), `${r.selector} leaves locked buttons/panel alone`);
    assert.ok(!/background|animation|transition/.test(r.body) || r.selector.includes("menu-panel"), `${r.selector}: no paint or motion change`);
  }
});

// ---------- TASK 040: confirm before New Match wipes a match ----------

// Reach a live mid-round state in round 2+ with a round-end save on
// disk and a CPU turn pending behind the timer — the richest state a
// mis-tapped New match could wipe.
function armMidMatch040(): void {
  fakeStorage.clear();
  fakeStorage.throws = false;
  newMatchTop();
  driveToRoundBanner031();
  assert.ok(fakeStorage.map.has(SCORE_KEY), "a round-end save exists");
  $("continue-btn").click();
  for (let steps = 0; steps < 400; steps++) {
    settleToYourTurn();
    humanMove();
    if (timerQueue.length > 0 && $("banner").hidden) return;
  }
  throw new Error("never reached a pending CPU turn mid-round");
}

const logLines040 = (): string[] => $("log").children.map((li) => li.textContent);

// The page minus the dialog's own surface: what "the game" is.
function gameDom040(): Record<string, DomSnapshot> {
  const { dom } = pageSnapshot();
  for (const id of ["confirm-overlay", "confirm-standing", "confirm-cancel", "confirm-new", "app"]) delete dom[id];
  return dom;
}

const docKey040 = (key: string): void => {
  for (const fn of fakeDocument.listeners.keydown ?? []) fn({ key });
};

const appInert040 = (): unknown => (registry.get("app") as unknown as { inert?: boolean }).inert;

test("e2e: New Match confirm — markup is a dialog in the overlay family; ships hidden; no motion, no chop (TASK 040)", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const block = html.slice(html.indexOf('<div class="overlay" id="confirm-overlay"'), html.indexOf("<script"));
  assert.ok(block.startsWith('<div class="overlay" id="confirm-overlay" hidden>'), "the shared .overlay shell, hidden at rest");
  assert.match(block, /<div class="modal confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-standing confirm-note">/);
  assert.match(block, /<h2 id="confirm-title">Start a new match\?<\/h2>/);
  assert.match(block, /<button id="confirm-cancel" type="button">Keep playing<\/button>/);
  assert.match(block, /<button id="confirm-new" class="danger" type="button">New Match<\/button>/);
  assert.ok(block.indexOf("confirm-cancel") < block.indexOf("confirm-new"), "Keep playing comes first");
  assert.ok(!/chop/i.test(block), "no chop vocabulary");
  // The page behind is the inert target.
  assert.ok(html.includes('<div class="wrap" id="app">'));
  for (const id of ["app", "confirm-overlay", "confirm-cancel", "confirm-new"]) {
    assert.equal(html.split(`id="${id}"`).length, 2, `#${id} appears exactly once`);
  }
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.confirm/.test(m[1]));
  assert.ok(rules.length > 0, "the dialog is styled");
  for (const rule of rules) assert.ok(!/animation|transition/.test(rule[2]), `no motion on ${rule[1].trim()}`);
});

test("e2e: New Match confirm — mid-match the header asks first; the game is frozen behind it; Keep playing resumes exactly (TASK 040)", async () => {
  await import("../src/main.js");
  armMidMatch040();
  const before = pageSnapshot();
  const saveBefore = fakeStorage.map.get(SCORE_KEY);
  const logBefore = logLines040();
  const scoresBefore = scoreValues();
  const roundBefore = $("round-num").textContent;
  const handBefore = handOrder();
  assert.ok(saveBefore, "a save is on disk");

  $("new-match-top").click();
  // The dialog is up, labelled with what would be lost; focus is on
  // the safe choice and the page behind is inert.
  assert.equal($("confirm-overlay").hidden, false, "mid-match New match asks first");
  assert.equal(
    $("confirm-standing").textContent,
    `Round ${roundBefore} · You ${scoresBefore[0]} · Mina ${scoresBefore[1]} · Kenji ${scoresBefore[2]} · Rosa ${scoresBefore[3]}`,
  );
  assert.equal(fakeDocument.activeElement, $("confirm-cancel"), "focus starts on Keep playing");
  assert.equal(appInert040(), true, "the table behind is inert");
  // Opening touched nothing but the dialog: no render, no reset, the
  // same pending timers, the same save bytes.
  const open = pageSnapshot();
  assert.deepEqual(gameDom040(), (() => {
    const dom = { ...before.dom };
    for (const id of ["confirm-overlay", "confirm-standing", "confirm-cancel", "confirm-new", "app"]) delete dom[id];
    return dom;
  })(), "opening touches nothing but the dialog");
  assert.equal(open.timers, before.timers);
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore);

  // Frozen: the pending CPU turn comes due while the dialog is up —
  // it is HELD, not played. Nothing on the table moves.
  const frozen = gameDom040();
  pumpTimers();
  assert.equal(timerQueue.length, 0, "every due timer fired");
  assert.deepEqual(gameDom040(), frozen, "no CPU move ran behind the dialog");
  assert.deepEqual(logLines040(), logBefore);
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore);
  assert.equal($("confirm-overlay").hidden, false, "still asking");

  // Keep playing: everything is exactly where it was — scores, round,
  // hand, log, the stored save bytes — and the held CPU turn is
  // re-armed (one timer), not lost.
  $("confirm-cancel").click();
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal(appInert040(), false, "the table is live again");
  assert.equal(fakeDocument.activeElement, $("new-match-top"), "focus returns to New match");
  assert.deepEqual(gameDom040(), frozen, "cancel changes nothing on the table");
  assert.deepEqual(scoreValues(), scoresBefore);
  assert.equal($("round-num").textContent, roundBefore);
  assert.deepEqual(handOrder(), handBefore);
  assert.deepEqual(logLines040(), logBefore);
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore, "the save bytes are untouched");
  assert.equal(timerQueue.length, 1, "the held CPU turn is re-armed");
  // Play resumes: the CPU sequence picks up where it paused.
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner");
  // (The log keeps its last 60 lines, so compare content, not length.)
  assert.notDeepEqual(logLines040(), logBefore, "the CPU moved after the dialog closed");
});

test("e2e: New Match confirm — Escape and the backdrop cancel; a tap inside the card does not (TASK 040)", async () => {
  await import("../src/main.js");
  armMidMatch040();
  const saveBefore = fakeStorage.map.get(SCORE_KEY);
  const frozen = gameDom040();
  // Escape cancels.
  $("new-match-top").click();
  assert.equal($("confirm-overlay").hidden, false);
  pumpTimers();
  docKey040("Enter");
  assert.equal($("confirm-overlay").hidden, false, "other keys leave it open");
  docKey040("Escape");
  assert.equal($("confirm-overlay").hidden, true, "Escape cancels");
  assert.equal(appInert040(), false);
  assert.deepEqual(gameDom040(), frozen);
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore);
  assert.equal(timerQueue.length, 1, "the held CPU turn is re-armed");
  // Escape with the dialog closed does nothing to the game.
  docKey040("Escape");
  assert.deepEqual(gameDom040(), frozen);
  // The backdrop cancels; a click whose target is inside the card
  // (here its standing line) does not.
  $("new-match-top").click();
  for (const fn of $("confirm-overlay").listeners.click ?? []) fn({ target: $("confirm-standing") });
  assert.equal($("confirm-overlay").hidden, false, "a tap inside the card is not the backdrop");
  $("confirm-overlay").click();
  assert.equal($("confirm-overlay").hidden, true, "the backdrop cancels");
  assert.deepEqual(gameDom040(), frozen);
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore);
  // A stray Confirm click with the dialog closed is inert.
  $("confirm-new").click();
  assert.deepEqual(gameDom040(), frozen, "Confirm does nothing unless the dialog is up");
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner", "play resumes");
});

test("e2e: New Match confirm — confirming clears the save and deals a fresh 0-0 round 1; play runs on (TASK 040)", async () => {
  await import("../src/main.js");
  armMidMatch040();
  assert.ok(fakeStorage.map.has(SCORE_KEY));
  $("new-match-top").click();
  pumpTimers(); // the pending CPU turn comes due and is held
  assert.equal(timerQueue.length, 0);
  $("confirm-new").click();
  // The confirmed New Match is today's New Match exactly.
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal(appInert040(), false);
  assert.equal(fakeStorage.map.has(SCORE_KEY), false, "the save is cleared");
  assert.equal(logLines040()[0], "New match — first to 13.");
  const pill = $("round-num").textContent;
  const scores = scoreValues();
  const freshQuiet = pill === "1" && scores.every((s) => s === 0);
  const freshInstant = pill === "2" && [...scores].sort((a, b) => a - b).join(",") === "-2,-2,-2,6";
  assert.ok(freshQuiet || freshInstant, `a fresh match (got ${scores.join("/")} at round ${pill})`);
  // The held CPU turn was re-armed, so a CPU-led fresh round still
  // runs — the page never hangs waiting on it.
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner");
  if (freshQuiet) {
    assert.equal(fakeStorage.map.has(SCORE_KEY), false, "a fresh 0-0 round-1 board writes no save");
  }
});

test("e2e: New Match confirm — a round-over banner is still a match in progress: it asks (TASK 040)", async () => {
  await import("../src/main.js");
  fakeStorage.clear();
  newMatchTop();
  driveToRoundBanner031();
  const save = fakeStorage.map.get(SCORE_KEY);
  const frozen = gameDom040();
  $("new-match-top").click();
  assert.equal($("confirm-overlay").hidden, false, "standings are on the line between rounds too");
  assert.match($("confirm-standing").textContent, /^Round 2 · You -?\d+ · Mina -?\d+ · Kenji -?\d+ · Rosa -?\d+$/);
  $("confirm-cancel").click();
  assert.deepEqual(gameDom040(), frozen, "the banner is exactly as it was");
  assert.equal(fakeStorage.map.get(SCORE_KEY), save);
});

// TASK 040 fix (VERIFY-040 FAIL): over a round-over banner, the
// banner's Continue lives OUTSIDE #app — keyboard focus reached it
// behind the dialog and Enter dealt the next round. The dialog must
// make every top-level <body> child but itself inert (late arrivals
// too) and release exactly that on close.
test("e2e: New Match confirm — over a round-over banner, everything behind the dialog is inert (Continue unreachable); cancel restores it exactly (TASK 040 fix)", async () => {
  await import("../src/main.js");
  // Own seeded deals, restored after: the shared Math.random stream
  // the later tests deal from is left exactly where it was.
  const sharedRandom = Math.random;
  Math.random = seededRng(4040);
  fakeStorage.clear();
  newMatchTop();
  driveToRoundBanner031();
  assert.equal($("banner").hidden, false, "a round-over banner is up");
  assert.equal($("banner-title").textContent, "Round over");

  // Mirror index.html's top-level <body> children into the fake body
  // (the fake has no markup parser), read from the real markup.
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const bodyHtml = html.slice(html.indexOf("<body>"), html.indexOf("</body>"));
  const topIds = [...bodyHtml.matchAll(/^    <div [^>]*id="([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(topIds, ["app", "start-screen", "banner", "help-overlay", "odds-overlay", "confirm-overlay"]);
  const body = fakeDocument.body;
  const bodyBefore = [...body.children];
  for (const id of topIds) body.appendChild($(id));
  // The banner's actions sit inside its modal; the dialog's buttons
  // inside the dialog overlay.
  const bannerModal = new FakeElement("div");
  $("banner").appendChild(bannerModal);
  bannerModal.append($("continue-btn"), $("new-match-btn"));
  $("confirm-overlay").append($("confirm-cancel"), $("confirm-new"));

  // A fake MutationObserver: late <body> arrivals are fed to it by hand.
  const observers = new Set<{ cb: (records: { addedNodes: FakeElement[] }[]) => void }>();
  class FakeObserver {
    cb: (records: { addedNodes: FakeElement[] }[]) => void;
    constructor(cb: (records: { addedNodes: FakeElement[] }[]) => void) {
      this.cb = cb;
    }
    observe(target: FakeElement): void {
      assert.equal(target, body, "watches <body>");
      observers.add(this);
    }
    disconnect(): void {
      observers.delete(this);
    }
  }
  const g = globalThis as { MutationObserver?: unknown };
  const priorObserver = g.MutationObserver;
  g.MutationObserver = FakeObserver;
  const lateNode = new FakeElement("div");
  lateNode.className = "overlay iwbeat";
  const lateText = new FakeText("stray");

  const inertOf = (node: FakeElement): boolean => (node as unknown as { inert?: boolean }).inert === true;
  const behindInert = (node: FakeElement): boolean => {
    for (let at: FakeElement | null = node; at; at = at.parent) if (inertOf(at)) return true;
    return false;
  };
  const inertMap = (): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const id of [...registry.keys()].sort()) map[id] = inertOf(registry.get(id)!);
    body.children.forEach((child, i) => { map[`body[${i}]`] = inertOf(child); });
    map.late = inertOf(lateNode);
    return map;
  };

  try {
    const save = fakeStorage.map.get(SCORE_KEY);
    const frozen = gameDom040();
    const log = logLines040();
    const timers = timerQueue.length;
    const inertBefore = inertMap();
    assert.ok(Object.values(inertBefore).every((v) => v === false), "nothing inert before the dialog opens");

    // Keyboard path (the verifier's scenario R): focus the header
    // New match and activate it — the dialog opens over the banner.
    $("new-match-top").focus();
    $("new-match-top").click();
    assert.equal($("confirm-overlay").hidden, false, "it asks over the round-over banner");
    assert.equal(fakeDocument.activeElement, $("confirm-cancel"));

    // Every top-level <body> child but the dialog is inert: the
    // banner (so its Continue and New Match), help, odds, the start
    // gate, the table — and anything already in <body> before.
    for (const child of body.children) {
      assert.equal(inertOf(child), child !== $("confirm-overlay"), `body child ${child.className || child.tagName} inert iff not the dialog`);
    }
    assert.equal(inertOf($("banner")), true, "the round banner is inert");
    assert.equal(behindInert($("continue-btn")), true, "Continue is unreachable behind the dialog");
    assert.equal(behindInert($("new-match-btn")), true, "the banner's New Match is unreachable too");
    assert.equal(inertOf($("app")), true, "the table is inert");
    assert.equal(behindInert($("confirm-cancel")), false, "Keep playing stays live");
    assert.equal(behindInert($("confirm-new")), false, "Confirm stays live");

    // A late arrival (e.g. the lazily-appended instant-win beat
    // overlay) is frozen as it lands; text nodes are ignored.
    assert.equal(observers.size, 1, "one watcher while open");
    body.append(lateNode, lateText);
    for (const o of observers) o.cb([{ addedNodes: [lateNode, lateText] }]);
    assert.equal(inertOf(lateNode), true, "a late overlay is inert too");
    assert.equal(inertOf(lateText), false, "text nodes are left alone");
    lateText.remove();

    // Nothing moved behind the dialog.
    assert.deepEqual(gameDom040(), frozen, "the banner and table are untouched while open");
    assert.deepEqual(logLines040(), log);

    // Cancel: exact restore — every inert flag back to its pre-open
    // value (the late node, added while open, is released too).
    $("confirm-cancel").click();
    assert.equal($("confirm-overlay").hidden, true);
    assert.equal(observers.size, 0, "the watcher is disconnected on close");
    const inertAfter = inertMap();
    assert.deepEqual(inertAfter, { ...inertBefore, [`body[${body.children.length - 1}]`]: false }, "inert released everywhere it was added");
    assert.ok(Object.values(inertAfter).every((v) => v === false));
    assert.deepEqual(gameDom040(), frozen, "the round-over banner is exactly as it was");
    assert.deepEqual(logLines040(), log);
    assert.equal(timerQueue.length, timers);
    assert.equal(fakeStorage.map.get(SCORE_KEY), save, "save bytes untouched");
    assert.equal(fakeDocument.activeElement, $("new-match-top"), "focus returns to the opener");

    // Escape cancels the same way.
    $("new-match-top").click();
    assert.equal(inertOf($("banner")), true);
    docKey040("Escape");
    assert.equal($("confirm-overlay").hidden, true);
    assert.ok(Object.values(inertMap()).every((v) => v === false), "Escape releases everything");
    assert.deepEqual(gameDom040(), frozen);

    // The banner works again once released: Continue deals round 2.
    $("continue-btn").click();
    assert.equal($("banner").hidden, true, "Continue works after the dialog closes");
    assert.equal($("round-num").textContent, "2");

    // Confirm releases everything too, then deals fresh.
    settleToYourTurn();
    $("new-match-top").click();
    assert.equal($("confirm-overlay").hidden, false);
    assert.equal(inertOf($("banner")), true);
    $("confirm-new").click();
    assert.equal($("confirm-overlay").hidden, true);
    assert.ok(Object.values(inertMap()).every((v) => v === false), "Confirm releases everything");
    assert.equal(observers.size, 0);
    assert.equal($("round-num").textContent, "1");
    assert.equal(fakeStorage.map.has(SCORE_KEY), false);
  } finally {
    lateNode.remove();
    lateText.remove();
    $("continue-btn").remove();
    $("new-match-btn").remove();
    bannerModal.remove();
    $("confirm-cancel").remove();
    $("confirm-new").remove();
    for (const id of topIds) $(id).remove();
    assert.deepEqual(body.children, bodyBefore, "fake body restored");
    if (priorObserver === undefined) delete g.MutationObserver;
    else g.MutationObserver = priorObserver;
    Math.random = sharedRandom;
  }
});

test("e2e: New Match confirm — the phone ☰ menu item asks too; focus returns to ☰ (TASK 037/040)", async () => {
  await import("../src/main.js");
  // Mirror the panel's children (the fake has no markup parser) so a
  // tap bubbles item -> panel -> document as in the page.
  for (const id of ["help-btn-top", "odds-btn-top", "new-match-top"]) $("menu-panel").appendChild($(id));
  const tap = (node: FakeElement): void => {
    const ev = { target: node };
    for (let at: FakeElement | null = node; at; at = at.parent) {
      for (const fn of at.listeners.click ?? []) fn(ev);
    }
    for (const fn of fakeDocument.listeners.click ?? []) fn(ev);
  };
  armMidMatch040();
  const saveBefore = fakeStorage.map.get(SCORE_KEY);
  const frozen = gameDom040();
  tap($("menu-btn"));
  assert.equal($("menu-btn").getAttribute("aria-expanded"), "true");
  tap($("new-match-top"));
  assert.equal($("menu-btn").getAttribute("aria-expanded"), "false", "the menu closes behind the dialog");
  assert.equal($("confirm-overlay").hidden, false, "the menu's New match asks first");
  // Frozen behind it: the pending CPU turn comes due and is held.
  // (The ☰ button's aria-expanded is the only table-side change —
  // the menu closed, as any item tap closes it.)
  pumpTimers();
  const frozenMenuClosed = gameDom040();
  delete frozenMenuClosed["menu-btn"];
  const frozenNoMenu = { ...frozen };
  delete frozenNoMenu["menu-btn"];
  assert.deepEqual(frozenMenuClosed, frozenNoMenu, "no CPU move ran behind the dialog");
  // Cancel from the phone: the game is untouched; focus goes to the
  // ☰ button (the item itself hides with its closed panel).
  docKey040("Escape");
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal(fakeDocument.activeElement, $("menu-btn"), "focus returns to ☰");
  assert.deepEqual(gameDom040(), frozen, "cancel from the menu changes nothing");
  assert.equal(fakeStorage.map.get(SCORE_KEY), saveBefore);
  // Confirm from the phone: today's New Match.
  tap($("menu-btn"));
  tap($("new-match-top"));
  assert.equal($("confirm-overlay").hidden, false);
  tap($("confirm-new"));
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal(fakeStorage.map.has(SCORE_KEY), false, "the save is cleared");
  assert.equal(logLines040()[0], "New match — first to 13.");
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner");
});

test("e2e: New Match confirm — nothing to lose stays one tap: match-over banner, header at match end, start gate (TASK 040)", async () => {
  const main = await import("../src/main.js");
  const playToMatchEnd = (): void => {
    for (let steps = 0; steps < 40000; steps++) {
      const phase = settle();
      if (phase === "banner") {
        if (isMatchEndBanner()) return;
        $("continue-btn").click();
        continue;
      }
      humanMove();
    }
    throw new Error("match never ended");
  };
  const assertFresh = (label: string): void => {
    assert.equal($("confirm-overlay").hidden, true, `${label}: no dialog`);
    assert.equal(logLines040()[0], "New match — first to 13.", `${label}: a fresh match`);
    const pill = $("round-num").textContent;
    const scores = scoreValues();
    assert.ok(
      (pill === "1" && scores.every((s) => s === 0)) ||
        (pill === "2" && [...scores].sort((a, b) => a - b).join(",") === "-2,-2,-2,6"),
      `${label}: fresh board (got ${scores.join("/")} at round ${pill})`,
    );
    assert.equal(fakeStorage.map.has(SCORE_KEY), false, `${label}: no save`);
  };
  fakeStorage.clear();
  // The match-over banner's New Match: one tap.
  newMatchTop();
  playToMatchEnd();
  assert.equal($("new-match-btn").hidden, false);
  $("new-match-btn").click();
  assertFresh("match-over banner");
  // The header button once the match is decided: one tap too.
  playToMatchEnd();
  $("new-match-top").click();
  assertFresh("header at match end");
  // The start gate's New Match beside Resume (TASK 039): one tap,
  // unchanged — it never asks, whatever the controller holds.
  settle();
  fakeStorage.setItem(SCORE_KEY, JSON.stringify({ scores: [5, -2, 3, 0], round: 4 }));
  main.render({
    phase: "idle", match: null, trick: null, message: "", log: [],
    trickView: emptyTrickView(), roundSummary: null, roundId: 0, trickId: 0,
  });
  assert.equal($("start-btn").textContent, "New Match");
  $("start-btn").click();
  assertFresh("start gate");
  settle();
});

// ---------- TASK 041: copy bundle + accessibility details ----------

const html041 = (): string => readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const inert041 = (id: string): boolean => (registry.get(id) as unknown as { inert?: boolean }).inert === true;
// The page minus one overlay's own surface (its open/closed flag).
function domWithout041(...ids: string[]): Record<string, DomSnapshot> {
  const { dom } = pageSnapshot();
  for (const id of ids) delete dom[id];
  return dom;
}

test("e2e: How to play agrees with the engine — sets, pair runs bomb-only, leftover last→1st, consecutive naming (TASK 041, audit #8)", () => {
  const html = html041();
  const help = html.slice(html.indexOf('<div class="overlay" id="help-overlay"'), html.indexOf('<div class="overlay" id="odds-overlay"'));
  const odds = html.slice(html.indexOf('<div class="overlay" id="odds-overlay"'), html.indexOf('<div class="overlay" id="confirm-overlay"'));
  // Pair runs are not a leadable/followable set: the sets list names
  // the five combinations, and the double run is called bomb-only.
  assert.ok(help.includes(
    "<p>3 is low, 2 is high; suits run ♠ &lt; ♣ &lt; ♦ &lt; ♥, so 2♥ is the biggest card in the game. Sets you lead and beat with: singles, pairs, triples, straights, and four of a kind. A double run (consecutive pairs) is not a set — it plays only as a bomb.</p>",
  ));
  assert.ok(!/Sets:[^<]*pair runs/.test(help), "pair runs are no longer listed among the sets");
  assert.ok(help.includes(
    "<p>A 3-pair double run bombs a single 2; a 4-pair double run bombs a pair of 2s; four of a kind bombs either. Already passed? Only four of a kind and the 4-pair double run can bring you back in.</p>",
  ));
  // Leftover points: last place pays 1st (scoring.ts), not "the
  // player above you".
  assert.ok(help.includes(
    "<p>1st +2, 2nd +1, 3rd pays 1 to 2nd, last pays 2 to 1st. Last place also pays 1st 1 point for each 2 and each unused bomb still in hand when the round ends.</p>",
  ));
  assert.ok(!help.includes("player above you"));
  // Naming: the sheet and the odds card agree.
  assert.ok(help.includes(
    "<p>Four 2s · six pairs · five consecutive pairs · dragon straight 3–A · three consecutive triples. Everyone pays you 2 and the round ends.</p>",
  ));
  assert.ok(!/straight pairs|straight triples/.test(help));
  assert.ok(odds.includes("<td>Five consecutive pairs</td>") && odds.includes("<td>Three consecutive triples</td>"));
  // Locked copy elsewhere untouched; never "chop".
  assert.ok(help.includes("<p>Bomb a 2 and its owner pays you 1 point per 2 — instantly.</p>"));
  assert.ok(!/chop/i.test(html));
});

test("e2e: overlay dialog semantics — How to play and Bomb odds are labelled modal dialogs; top close sits above the title (TASK 041, audit #8/#18)", () => {
  const html = html041();
  assert.match(html, /<div class="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title">\n {8}<div class="help-top">\n {10}<button id="help-close-top" class="ghost small" type="button" aria-label="Close How to play"><span aria-hidden="true">✕<\/span> Close<\/button>\n {8}<\/div>\n {8}<h2 id="help-title">How to play<\/h2>/);
  assert.ok(html.indexOf('id="help-close-top"') < html.indexOf('id="help-close"'), "the top close comes first");
  assert.ok(html.includes('<button id="help-close" type="button">Close</button>'), "the bottom Close stays");
  assert.ok(html.includes('<div class="modal oddscard" role="dialog" aria-modal="true" aria-labelledby="odds-title" aria-describedby="odds-frame">'));
  assert.ok(html.includes('<h2 id="odds-title">Bomb odds</h2>'));
  assert.ok(html.includes('<p class="odds-frame" id="odds-frame">'));
  // The Task 040 dialog keeps its own markup.
  assert.ok(html.includes('<div class="modal confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-standing confirm-note">'));
  for (const id of ["help-title", "help-close-top", "odds-title", "odds-frame"]) {
    assert.equal(html.split(`id="${id}"`).length, 2, `#${id} appears exactly once`);
  }
  // The log announces new entries; the message line keeps role=status.
  assert.ok(html.includes('<ol class="log" id="log" aria-live="polite"></ol>'));
  assert.ok(html.includes('<div class="selinfo" id="message" role="status"></div>'));
  // The close row is styled without motion.
  const { rules } = task025Rules();
  const top = rules.filter((r) => r.selector.includes("help-top"));
  assert.equal(top.length, 1);
  assert.ok(!/animation|transition/.test(top[0].body));
});

test("e2e: How to play — focus moves in, Escape / top Close / bottom Close / backdrop close it, focus returns to the opener; the game is untouched (TASK 041)", async () => {
  await import("../src/main.js");
  newMatchTop();
  settleToYourTurn();
  const before = domWithout041("help-overlay");
  const timers = timerQueue.length;
  $("help-close-top"); // registered (the fake creates on first lookup)

  // Header opener, Escape.
  $("help-btn-top").focus();
  $("help-btn-top").click();
  assert.equal($("help-overlay").hidden, false);
  assert.equal(fakeDocument.activeElement, $("help-close-top"), "focus moves to the top close control");
  assert.equal(inert041("app"), true, "the table behind is inert while the sheet is open");
  docKey040("Enter");
  assert.equal($("help-overlay").hidden, false, "other keys leave it open");
  docKey040("Escape");
  assert.equal($("help-overlay").hidden, true, "Escape closes the sheet");
  assert.equal(inert041("app"), false, "the table is live again");
  assert.equal(fakeDocument.activeElement, $("help-btn-top"), "focus returns to the opener");

  // Top close.
  $("help-btn-top").click();
  $("help-close-top").click();
  assert.equal($("help-overlay").hidden, true, "the top close control closes it");
  assert.equal(fakeDocument.activeElement, $("help-btn-top"));
  // Bottom close and the backdrop still work.
  $("help-btn-top").click();
  $("help-close").click();
  assert.equal($("help-overlay").hidden, true);
  assert.equal(fakeDocument.activeElement, $("help-btn-top"));
  $("help-btn-top").click();
  for (const fn of $("help-overlay").listeners.click ?? []) fn({ target: new FakeElement("p") });
  assert.equal($("help-overlay").hidden, false, "a tap inside the sheet is not the backdrop");
  $("help-overlay").click();
  assert.equal($("help-overlay").hidden, true);
  assert.equal(inert041("app"), false);

  // The start screen's opener gets focus back too.
  $("help-btn-start").click();
  assert.equal(fakeDocument.activeElement, $("help-close-top"));
  docKey040("Escape");
  assert.equal(fakeDocument.activeElement, $("help-btn-start"));

  // From the phone ☰ menu (open menu = a menu-item tap): focus goes
  // back to ☰, since the item hides with its panel.
  $("menu-btn").setAttribute("aria-expanded", "true");
  $("help-btn-top").click();
  $("menu-btn").setAttribute("aria-expanded", "false");
  docKey040("Escape");
  assert.equal($("help-overlay").hidden, true);
  assert.equal(fakeDocument.activeElement, $("menu-btn"));

  // Escape with nothing open does nothing; nothing in the game moved.
  docKey040("Escape");
  assert.deepEqual(domWithout041("help-overlay"), before, "open/close cycles leave the game exactly as it was");
  assert.equal(timerQueue.length, timers);
  assert.equal($("play-btn").disabled, false, "still your turn");
});

test("e2e: Bomb odds — focus moves to Close, Escape closes, focus returns; the confirm dialog is unregressed alongside (TASK 041)", async () => {
  await import("../src/main.js");
  armMidMatch040();
  const before = domWithout041("odds-overlay");
  $("odds-btn-top").click();
  assert.equal($("odds-overlay").hidden, false);
  assert.equal(fakeDocument.activeElement, $("odds-close"), "focus moves into the card");
  assert.equal(inert041("app"), true);
  docKey040("Escape");
  assert.equal($("odds-overlay").hidden, true, "Escape closes the card");
  assert.equal(inert041("app"), false);
  assert.equal(fakeDocument.activeElement, $("odds-btn-top"), "focus returns to Bomb odds");
  $("odds-btn-top").click();
  $("odds-close").click();
  assert.equal(fakeDocument.activeElement, $("odds-btn-top"));
  assert.deepEqual(domWithout041("odds-overlay"), before, "the game is untouched");

  // Task 040 behavior on the same shared plumbing: opens, freezes
  // the CPU turn, Escape cancels, focus returns, the turn re-arms.
  const frozen = gameDom040();
  $("new-match-top").click();
  assert.equal($("confirm-overlay").hidden, false);
  assert.equal(fakeDocument.activeElement, $("confirm-cancel"));
  pumpTimers();
  assert.deepEqual(gameDom040(), frozen, "no CPU move behind the dialog");
  docKey040("Escape");
  assert.equal($("confirm-overlay").hidden, true);
  assert.equal($("odds-overlay").hidden, true, "Escape closed only the open dialog");
  assert.equal(fakeDocument.activeElement, $("new-match-top"));
  assert.equal(timerQueue.length, 1, "the held CPU turn is re-armed");
  const result = settle();
  assert.ok(result === "your-turn" || result === "banner");
});

test("e2e: Sort aria-label names the direction a tap goes, both ways (TASK 041, audit #18)", async () => {
  await import("../src/main.js");
  newMatchTop();
  settleToYourTurn();
  assert.equal($("sort-btn").getAttribute("aria-label"), "Sort hand low to high ascending, tap to sort high to low descending");
  $("sort-btn").click();
  assert.equal($("sort-btn").getAttribute("aria-label"), "Sort hand high to low descending, tap to sort low to high ascending");
  assert.equal($("sort-btn").title, "Sorted high to low (descending) — tap to sort low to high (ascending)");
  $("sort-btn").click();
  assert.equal($("sort-btn").getAttribute("aria-label"), "Sort hand low to high ascending, tap to sort high to low descending");
  assert.equal($("sort-btn").title, "Sorted low to high (ascending) — tap to sort high to low (descending)");
});

test("e2e: a rejected play shows mapped guidance in the error style; a hint does not (TASK 041, audit #7)", async () => {
  await import("../src/main.js");
  newMatchTop();
  const hasError = (): boolean => $("message")._classes.has("error");
  // Nothing selected: guidance, error style.
  settleToYourTurn();
  $("clear-btn").click();
  $("play-btn").click();
  assert.match($("message").textContent, /^Select at least one card first — (or Pass|tap cards in your hand, then Play)\.$/);
  assert.equal(hasError(), true, "an error wears the error style");
  // A hint is not an error.
  $("hint-btn").click();
  assert.match($("message").textContent, /^Hint: /);
  assert.equal(hasError(), false, "a hint keeps the plain line");
  // Play your lowest single into the table until one is rejected for
  // not beating it: the copy names the table and what beats it.
  let seen = "";
  for (let steps = 0; steps < 400 && !seen; steps++) {
    const phase = settle();
    if (phase === "banner") {
      if (!$("new-match-btn").hidden) $("new-match-btn").click();
      else $("continue-btn").click();
      continue;
    }
    $("clear-btn").click();
    $("hand").children[0].click();
    $("play-btn").click();
    const text = $("message").textContent;
    if (/^Beat /.test(text) || /^Nothing beats/.test(text)) seen = text;
    else if (text) humanMove(); // a legal lead or a guidance line: move on with the hint
  }
  assert.ok(seen, "an engine rejection was shown");
  assert.match(seen, /^(Beat (single|a pair|a triple|a \d-card straight|four of a kind|a \d-pair double run).* — or Pass\.|Nothing beats triple 2s — Pass\.)$/);
  assert.ok(!/does not beat the current trick play/.test(seen), "not the engine's raw string");
  assert.equal(hasError(), true);
  // The style is its own rule: the error line differs from the plain
  // line and from the hint, and does not animate.
  const { rules } = task025Rules();
  const err = rules.filter((r) => r.selector === ".selinfo.error");
  assert.equal(err.length, 1);
  assert.match(err[0].body, /color:#ffb3ab;/);
  assert.ok(rules.some((r) => r.selector === ".selinfo.error::before" && /content:/.test(r.body)), "a non-color marker too");
  for (const r of rules.filter((x) => x.selector.startsWith(".selinfo.error"))) assert.ok(!/animation|transition/.test(r.body));
  // A legal move clears it.
  humanMove();
  assert.equal(hasError(), false);
});

test("e2e: the live log appends new lines in place — painted lines are kept, never re-announced (TASK 041, audit #18)", async () => {
  await import("../src/main.js");
  newMatchTop();
  settleToYourTurn();
  const first = [...$("log").children];
  assert.ok(first.length > 0);
  // A re-render with no new lines touches no log node.
  $("clear-btn").click();
  assert.deepEqual($("log").children, first, "same nodes, same order");
  // Moves add lines: the old nodes stay (until the 60-line cap drops
  // them from the top) and only new ones are appended.
  for (let i = 0; i < 30; i++) {
    const before = [...$("log").children];
    if (settle() === "banner") {
      if (!$("new-match-btn").hidden) $("new-match-btn").click();
      else $("continue-btn").click();
      continue;
    }
    humanMove();
    settle();
    const after = $("log").children;
    const kept = after.filter((li) => before.includes(li));
    const k = before.indexOf(kept[0]);
    assert.ok(kept.length > 0, "painted lines are kept");
    assert.deepEqual(kept, before.slice(k), "the kept lines are the old tail, in order");
    assert.deepEqual(after.slice(0, kept.length), kept, "new lines only append after them");
  }
  // A new match repaints from its first line.
  newMatchTop();
  assert.equal(logLines040()[0], "New match — first to 13.");
});

// ---------- TASK 042 (audit #4): round-over banner bomb-penalty note rows ----------
// Mid-round bomb penalties land on the match scores when they happen,
// so they are inside TOTAL but not in ROUND. The banner explains the
// gap with a note row under the seat: previous + ROUND + note = TOTAL.
// These tests read the RENDERED banner and check that identity for
// every seat in every round of full seeded matches played through the
// real page, and cross-check each note's amount against the
// "Bomb penalty:" log lines the page painted during that round (an
// independent ledger: the log copy, not the summary's chops array).

interface BannerSeat042 {
  seat: number;
  total: number;
  round: number;
  note: number | null;
}

interface BannerRead042 {
  instant: boolean;
  seats: BannerSeat042[];
  noteRows: number;
}

const POSSESSIVE042 = ["your", "her", "his", "her"];
const hasCls042 = (node: FakeElement, cls: string): boolean =>
  (node.className ?? "").split(/\s+/).includes(cls);
const findAll042 = (node: FakeElement, pred: (n: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] => {
  if (pred(node)) out.push(node);
  for (const child of node.children) findAll042(child, pred, out);
  return out;
};

function readBanner042(): BannerRead042 {
  const body = $("banner-body");
  const table = body.children.find((c) => c.tagName === "TABLE");
  assert.ok(table, "the banner has a table");
  const seats: BannerSeat042[] = [];
  let noteRows = 0;
  if (!hasCls042(table, "sumtable")) {
    // Instant-win variant (TASK 014/033): untouched — no note rows.
    assert.equal(findAll042(body, (n) => hasCls042(n, "bombnote") || hasCls042(n, "bombnotetr")).length, 0,
      "the instant-win banner carries no bomb-penalty note");
    for (const tr of table.children) {
      const seat = SEAT_NAMES.indexOf(tr.children[0].textContent.replace(/^★ /, ""));
      assert.ok(seat >= 0, `instant-win row names a seat: ${tr.textContent}`);
      const total = /^score (-?\d+)$/.exec(tr.children[1].textContent)?.[1];
      assert.ok(total !== undefined, `instant-win total cell: ${tr.children[1].textContent}`);
      seats.push({ seat, total: Number(total), round: Number(tr.children[2].textContent), note: null });
    }
    assert.equal(seats.length, 4);
    return { instant: true, seats, noteRows };
  }
  let current: BannerSeat042 | null = null;
  let afterNote = false;
  for (const tr of table.children) {
    if (tr.tagName !== "TR") continue;
    if (hasCls042(tr, "penrowtr")) {
      assert.ok(current && !afterNote, "round-end penalty rows stay directly under their payer, ahead of any note");
      continue;
    }
    if (hasCls042(tr, "bombnotetr")) {
      assert.ok(current, "a note row follows a player row");
      assert.equal(current.note, null, "at most one note row per seat");
      assert.equal(tr.children.length, 1, "one full-width cell — a note, not a fifth column");
      const cell = tr.children[0];
      assert.equal(cell.getAttribute("colspan"), "4", "the note spans the four columns");
      const p = cell.children[0];
      assert.ok(hasCls042(p, "note") && hasCls042(p, "bombnote"), "the note carries .note.bombnote");
      const m = /^Bomb penalty: ([+-]\d+) — mid-round, already in (\w+) total\.$/.exec(p.textContent);
      assert.ok(m, `note copy: ${p.textContent}`);
      assert.equal(m[2], POSSESSIVE042[current.seat], `${SEAT_NAMES[current.seat]}: per-seat possessive`);
      assert.ok(!/chop/i.test(p.textContent), "no chop vocabulary");
      current.note = Number(m[1]);
      assert.notEqual(current.note, 0, "a zero net never renders");
      noteRows += 1;
      afterNote = true;
      continue;
    }
    // A player row: the locked four cells (TASK 032).
    assert.equal(tr.children.length, 4, "player rows keep exactly PLACE / PLAYER / TOTAL / ROUND");
    const seat = SEAT_NAMES.indexOf(tr.children[1].textContent);
    assert.ok(seat >= 0, `player row names a seat: ${tr.children[1].textContent}`);
    current = {
      seat,
      total: Number(tr.children[2].children[0].textContent),
      round: Number(tr.children[3].textContent),
      note: null,
    };
    seats.push(current);
    afterNote = false;
  }
  assert.equal(seats.length, 4, "four player rows");
  return { instant: false, seats, noteRows };
}

interface RoundRecord042 {
  round: number;
  instant: boolean;
  notes: (number | null)[];
  noteRows: number;
  kinds: Set<string>;
  paidAndReceived: number[];
}

const PENALTY_LINE042 = /^Bomb penalty: (\w+) pays? (\d+) to (\w+) — \w+ (2|pair of 2s|bomb) was bombed\.$/;

// Plays one full seeded match through the real page (Hint-driven
// human seat, the e2e convention) and checks every banner.
function playSeeded042(seed: number): RoundRecord042[] {
  const logEl = $("log");
  const painted: string[] = [];
  const originalAppend = logEl.appendChild;
  logEl.appendChild = (node: FakeElement): FakeElement => {
    painted.push(node.textContent);
    return originalAppend.call(logEl, node);
  };
  const records: RoundRecord042[] = [];
  try {
    pumpTimers();
    Math.random = seededRng(seed);
    newMatchTop();
    let prev = [0, 0, 0, 0];
    for (let steps = 0; steps < 200000; steps++) {
      if (settle() === "your-turn") {
        humanMove();
        continue;
      }
      const round = records.length + 1;
      const banner = readBanner042();
      // The round's ledger from the painted log copy.
      const logNet = [0, 0, 0, 0];
      const paid = new Set<number>();
      const recv = new Set<number>();
      const kinds = new Set<string>();
      for (const line of painted) {
        const m = PENALTY_LINE042.exec(line);
        if (!m) continue;
        const payer = SEAT_NAMES.indexOf(m[1]);
        const payee = SEAT_NAMES.indexOf(m[3]);
        assert.ok(payer >= 0 && payee >= 0, line);
        logNet[payer] -= Number(m[2]);
        logNet[payee] += Number(m[2]);
        paid.add(payer);
        recv.add(payee);
        kinds.add(m[4] === "bomb" ? "bomb" : "two");
      }
      const notes: (number | null)[] = [null, null, null, null];
      for (const s of banner.seats) {
        const name = SEAT_NAMES[s.seat];
        const note = s.note ?? 0;
        notes[s.seat] = s.note;
        // The decisive identity (VERIFY-042 item 4).
        assert.equal(prev[s.seat] + s.round + note, s.total,
          `seed ${seed} round ${round} ${name}: previous ${prev[s.seat]} + ROUND ${s.round} + note ${note} = TOTAL ${s.total}`);
        assert.equal(note, logNet[s.seat], `seed ${seed} round ${round} ${name}: the note matches the round's Bomb penalty log lines`);
        assert.equal(s.total, scoreValues()[s.seat], `seed ${seed} round ${round} ${name}: TOTAL matches the scoreboard`);
      }
      if (banner.instant) assert.equal(kinds.size, 0, "no mid-round penalties in an instant-win round");
      records.push({
        round,
        instant: banner.instant,
        notes,
        noteRows: banner.noteRows,
        kinds,
        paidAndReceived: [0, 1, 2, 3].filter((p) => paid.has(p) && recv.has(p)),
      });
      prev = banner.seats.reduce((acc, s) => {
        acc[s.seat] = s.total;
        return acc;
      }, [0, 0, 0, 0]);
      if (isMatchEndBanner()) return records;
      painted.length = 0;
      $("continue-btn").click();
    }
    throw new Error(`seed ${seed}: the match never ended`);
  } finally {
    logEl.appendChild = originalAppend;
  }
}

test("e2e: round-over banner bomb-penalty notes reconcile — seed 50: both kinds, a seat that paid and received, an instant-win round, clean rounds (TASK 042)", async () => {
  await import("../src/main.js");
  const records = playSeeded042(50);
  assert.equal(records.length, 7, "seed 50 plays a 7-round match");
  // Round 3: Mina bombs your 2 (You pay her 1), then Kenji bombs
  // Mina's bomb (she pays him 1): both kinds in one round; Mina paid
  // AND received, netting zero, so she shows no note.
  const r3 = records[2];
  assert.deepEqual([...r3.kinds].sort(), ["bomb", "two"], "round 3 has a bombed 2 and a beaten bomb");
  assert.deepEqual(r3.paidAndReceived, [1], "Mina both paid and received in round 3");
  assert.deepEqual(r3.notes, [-1, null, 1, null], "notes: You -1, Kenji +1; Mina nets zero — no note");
  assert.equal(r3.noteRows, 2);
  // Round 4: an instant win, mid-match, reconciles with no notes.
  assert.equal(records[3].instant, true, "round 4 is an instant-win round");
  assert.equal(records[3].noteRows, 0);
  // Every other round is penalty-free: no note lines anywhere.
  for (const r of records) {
    if (r.round === 3) continue;
    assert.equal(r.kinds.size, 0, `round ${r.round} has no mid-round penalty`);
    assert.equal(r.noteRows, 0, `round ${r.round}: no note lines anywhere`);
  }
});

test("e2e: round-over banner bomb-penalty notes reconcile — seed 164: a seat that paid and received with a nonzero net, every round of a 26-round match (TASK 042)", async () => {
  await import("../src/main.js");
  const records = playSeeded042(164);
  assert.equal(records.length, 26, "seed 164 plays a 26-round match");
  // Round 5: You bomb Rosa's 2 (+1), your bomb is bombed by Mina (-1),
  // you bomb Mina's bomb back (+1): You net +1 having paid and
  // received; Mina paid and received, net zero; Rosa -1.
  const r5 = records[4];
  assert.deepEqual([...r5.kinds].sort(), ["bomb", "two"]);
  assert.deepEqual(r5.paidAndReceived, [0, 1], "You and Mina both paid and received in round 5");
  assert.deepEqual(r5.notes, [1, null, null, -1], "notes: You +1, Rosa -1; Mina nets zero — no note");
  assert.ok(records.filter((r) => r.noteRows > 0).length >= 5, "several rounds carry notes");
  assert.ok(records.some((r) => !r.instant && r.kinds.size === 0 && r.noteRows === 0), "a clean round shows no note lines");
});

test("css: the bomb-penalty note is a subordinate static note — smaller than the row text, no animation (TASK 042)", () => {
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), body: m[2] }));
  const note = rules.find((r) => r.selector === ".sumtable .bombnotetr p.note");
  assert.ok(note, "the note rule exists");
  assert.match(note.body, /font-size:12\.5px/, "smaller than the 14.5px modal note text");
  assert.ok(!/animation/.test(note.body), "the note is static");
  assert.ok(!rules.some((r) => r.selector.includes("bombnote") && /animation|transition/.test(r.body)),
    "no motion on the note (reduced motion has nothing to still)");
});
