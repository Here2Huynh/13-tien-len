import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TOTAL_HANDS,
  cardRows,
  enumerateDealtOdds,
  formatOneIn,
  formatPercent,
  type DealtOdds,
} from "./bomb-odds.js";

// TASK 022: the Bomb odds card's figures are the engine's. The full
// enumeration (test/bomb-odds.ts — every C(52,13) dealt hand, judged
// by detectBomb and detectInstantWin) runs here once and the card in
// index.html is pinned to it, row by row. If the engine's detection
// ever changes, these tests fail until the card is re-derived.

let cached: DealtOdds | null = null;
const odds = (): DealtOdds => (cached ??= enumerateDealtOdds());

const choose = (n: number, k: number): bigint => {
  let r = 1n;
  for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1);
  return r;
};

test("bomb odds: the enumeration covers every dealt hand and finds the engine's bomb patterns (TASK 022)", () => {
  const o = odds();
  assert.equal(BigInt(TOTAL_HANDS), choose(52, 13));
  assert.equal(o.total, TOTAL_HANDS, "weights must sum to C(52,13)");
  // Every rank multiset detectBomb accepts: four of a kind in each of
  // the 13 ranks (2s included); 3-pair runs 3-4-5 up to Q-K-A (10);
  // 4-pair runs 3-4-5-6 up to J-Q-K-A (9). 2s never join a run.
  assert.deepEqual(o.patterns, {
    "pair-sequence-3": 10,
    "pair-sequence-4": 9,
    "four-of-a-kind": 13,
  });
});

test("bomb odds: exact engine-derived hand counts, cross-checked by closed forms (TASK 022)", () => {
  const o = odds();
  // The enumeration result, exact (hands out of 635,013,559,600).
  assert.deepEqual(o.bombs, {
    "pair-sequence-3": 53096899088,
    "pair-sequence-4": 6103825920,
    "four-of-a-kind": 21717689136,
  });
  assert.equal(o.anyBomb, 73852645680);
  assert.deepEqual(o.instantWins, {
    "four-2s": 1677106640,
    "six-pairs": 2746828848,
    "five-consecutive-pairs": 411724800,
    "dragon-straight": 369098752,
    "three-consecutive-triples": 63240112,
  });
  assert.equal(o.anyInstantWin, 5267999152);
  const sum = Object.values(o.instantWins).reduce((a, b) => a + b, 0);
  assert.equal(sum, o.anyInstantWin, "each instant-win hand is counted under exactly one kind");

  // Independent closed forms where they are short:
  // four of a kind, by inclusion-exclusion over how many quads.
  let quads = 0n;
  for (let k = 1; k <= 3; k++) {
    const term = choose(13, k) * choose(52 - 4 * k, 13 - 4 * k);
    quads += k % 2 === 1 ? term : -term;
  }
  assert.equal(BigInt(o.bombs["four-of-a-kind"]), quads);
  // Four 2s: the other 9 cards from the remaining 48.
  assert.equal(BigInt(o.instantWins["four-2s"]), choose(48, 9));
  // Dragon straight: one of each of 3..A plus a 2 (4 x 4^12), or plus
  // a second card of one of those 12 ranks (12 x C(4,2) x 4^11).
  assert.equal(BigInt(o.instantWins["dragon-straight"]), 4n * 4n ** 12n + 12n * 6n * 4n ** 11n);
});

test("bomb odds: every figure on the card is the engine's, row by row, in the shipped page (TASK 022)", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const card = html.match(/<div class="overlay" id="odds-overlay" hidden>([\s\S]*?)\n {4}<\/div>\n/)?.[1];
  assert.ok(card, "the Bomb odds overlay must ship in index.html, hidden");
  const tableAfter = (header: string): string[][] => {
    const block = card.split(`<h3>${header}</h3>`)[1]?.match(/<table class="odds">([\s\S]*?)<\/table>/)?.[1];
    assert.ok(block, `missing ${header} table`);
    return [...block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
      [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]));
  };
  const rows = cardRows(odds());
  const expected = (list: [string, number][]): string[][] =>
    list.map(([label, hands]) => [label, formatPercent(hands), formatOneIn(hands)]);
  assert.deepEqual(tableAfter("BOMBS"), expected(rows.bombs));
  assert.deepEqual(tableAfter("INSTANT WINS"), expected(rows.instantWins));
  // The shipped figures, spelled out (the format is pinned too).
  assert.deepEqual(expected(rows.bombs).map((r) => r.slice(1).join(" · ")), [
    "8.36% · 1 in 12", "3.42% · 1 in 29", "0.96% · 1 in 104", "11.63% · 1 in 8.6",
  ]);
  assert.deepEqual(expected(rows.instantWins).map((r) => r.slice(1).join(" · ")), [
    "0.43% · 1 in 231", "0.26% · 1 in 379", "0.065% · 1 in 1,542",
    "0.058% · 1 in 1,720", "0.010% · 1 in 10,041", "0.83% · 1 in 121",
  ]);
  assert.ok(card.includes("<h2>Bomb odds</h2>"));
  assert.ok(card.includes("Dealt-hand odds: the chance your 13-card deal holds each one."));
  assert.ok(card.includes("A deal that fits two instant wins counts once, as the one the game awards."));
  assert.ok(!html.toLowerCase().includes("chop"), "no chop vocabulary in the page");
});
