import test from "node:test";
import assert from "node:assert/strict";
import { makeCard } from "../src/engine/cards.js";
import {
  scoreRound,
  scoreInstantWin,
  countUnusedBombs,
  leftoverPenalty,
} from "../src/engine/scoring.js";

const c = makeCard;
const empty = [[], [], [], []];

test("baseline-only round: 1st +2, 2nd +1, 3rd -1, last -2", () => {
  // Finish order: player 2 first, then 0, then 3, player 1 last.
  const hands = [[], [], [], []];
  hands[1] = [c("9", "spades"), c("5", "clubs")]; // last's leftovers, no penalties
  const { deltas, penalties } = scoreRound([2, 0, 3, 1], hands);
  assert.deepEqual(deltas, [1, -2, 2, -1]);
  assert.deepEqual(penalties, []);
  assert.equal(deltas.reduce((a, b) => a + b, 0), 0);
});

test("leftover 2s: 1 point each, paid by last to 1st", () => {
  const hands = [[], [], [], [c("2", "spades"), c("2", "hearts"), c("9", "clubs")]];
  const { deltas, penalties } = scoreRound([0, 1, 2, 3], hands);
  assert.deepEqual(deltas, [4, 1, -1, -4]);
  assert.deepEqual(penalties, [{ player: 3, points: 2, paidTo: 0 }]);
  assert.equal(deltas.reduce((a, b) => a + b, 0), 0);
});

test("unused bomb: four of a kind left in hand costs 1, paid to 1st", () => {
  const hands = [
    [], [],
    [],
    [c("7", "spades"), c("7", "clubs"), c("7", "diamonds"), c("7", "hearts"), c("9", "clubs")],
  ];
  const { deltas, penalties } = scoreRound([0, 1, 2, 3], hands);
  assert.deepEqual(deltas, [3, 1, -1, -3]);
  assert.deepEqual(penalties, [{ player: 3, points: 1, paidTo: 0 }]);
});

test("unused bomb: a complete pair sequence left in hand costs 1", () => {
  const hands = [
    [], [], [],
    [
      c("3", "spades"), c("3", "clubs"),
      c("4", "spades"), c("4", "clubs"),
      c("5", "spades"), c("5", "clubs"),
      c("8", "spades"),
    ],
  ];
  const { penalties } = scoreRound([0, 1, 2, 3], hands);
  assert.deepEqual(penalties, [{ player: 3, points: 1, paidTo: 0 }]);
});

test("leftover 2s and a bomb stack", () => {
  const hand = [
    c("2", "clubs"),
    c("8", "spades"), c("8", "clubs"), c("8", "diamonds"), c("8", "hearts"),
  ];
  assert.deepEqual(leftoverPenalty(hand), { twos: 1, bombs: 1, points: 2 });
});

test("countUnusedBombs counting", () => {
  const pair = (r) => [c(r, "spades"), c(r, "clubs")];
  // 4-pair sequence counts once; a 6-pair run holds two 3-pair sequences.
  assert.equal(countUnusedBombs([...pair("3"), ...pair("4"), ...pair("5"), ...pair("6")]), 1);
  assert.equal(
    countUnusedBombs([...pair("3"), ...pair("4"), ...pair("5"), ...pair("6"), ...pair("7"), ...pair("8")]),
    2,
  );
  // Two separate four of a kinds.
  assert.equal(
    countUnusedBombs([
      c("9", "spades"), c("9", "clubs"), c("9", "diamonds"), c("9", "hearts"),
      c("K", "spades"), c("K", "clubs"), c("K", "diamonds"), c("K", "hearts"),
    ]),
    2,
  );
  // Pairs 3-4, four 5s, pairs 6-7: the quad counts once, disjoint.
  assert.equal(
    countUnusedBombs([
      ...pair("3"), ...pair("4"),
      c("5", "spades"), c("5", "clubs"), c("5", "diamonds"), c("5", "hearts"),
      ...pair("6"), ...pair("7"),
    ]),
    1,
  );
  // Nothing bomb-like.
  assert.equal(countUnusedBombs([c("3", "spades"), c("9", "clubs"), c("2", "hearts")]), 0);
});

test("instant-win payout: winner +6, others -2, no penalties", () => {
  const { deltas, penalties } = scoreInstantWin(2);
  assert.deepEqual(deltas, [-2, -2, 6, -2]);
  assert.deepEqual(penalties, []);
});

test("scoreRound rejects a bad finish order", () => {
  assert.throws(() => scoreRound([0, 1, 2], empty), /finish order/);
  assert.throws(() => scoreRound([0, 0, 1, 2], empty), /finish order/);
});
